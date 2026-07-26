import { Buffer } from "node:buffer";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { ApiError } from "@/lib/api-error";
import {
  getAllowedModelIds,
  getDefaultMonthlyBudgetUsd,
  getMaxUserAttachmentStorageBytes,
  getOptionalEnv
} from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";
import { logEvent } from "@/lib/observability";
import { hashGuardrailKey } from "@/lib/request-security";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  parsePricingValue,
  roundUsd,
  type ModelPricing,
  type ModelPricingMap
} from "@/lib/usage";

const BUDGET_RESERVATION_TTL_SECONDS = 20 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const MAX_MODEL_INPUT_BYTES = 400_000;

type RateLimitRow = {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
};

type BudgetReservationRow = {
  allowed: boolean;
  reservation_id: string | null;
  budget_usd: number | string;
  spent_usd: number | string;
  reserved_usd: number | string;
};

export type OperationLease = {
  release: () => Promise<void>;
};

export async function enforceRateLimit(params: {
  scope: string;
  key: string;
  limit: number;
  windowSeconds: number;
  message: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_scope: params.scope,
    p_key_hash: hashGuardrailKey(params.key),
    p_limit: params.limit,
    p_window_seconds: params.windowSeconds
  });

  if (error) throw guardrailUnavailable(error);
  const result = firstRow<RateLimitRow>(data);
  if (!result) throw new ApiError(503, "Rate-limit service returned no result.");
  if (!result.allowed) {
    const retryAfter = Math.max(1, Number(result.retry_after_seconds) || 1);
    throw new ApiError(429, params.message, { "Retry-After": String(retryAfter) });
  }
}

export async function acquireOperationLease(params: {
  scope: string;
  key: string;
  ttlSeconds: number;
  conflictMessage: string;
}): Promise<OperationLease> {
  const admin = createSupabaseAdminClient();
  const keyHash = hashGuardrailKey(params.key);
  const token = crypto.randomUUID();
  const { data, error } = await admin.rpc("acquire_operation_lease", {
    p_scope: params.scope,
    p_key_hash: keyHash,
    p_lease_token: token,
    p_ttl_seconds: params.ttlSeconds
  });

  if (error) throw guardrailUnavailable(error);
  if (data !== true) throw new ApiError(409, params.conflictMessage);

  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      const { error: releaseError } = await admin.rpc("release_operation_lease", {
        p_scope: params.scope,
        p_key_hash: keyHash,
        p_lease_token: token
      });
      if (releaseError) {
        logEvent("warn", "Operation lease release failed", {
          scope: params.scope,
          error: getErrorMessage(releaseError)
        });
      }
    }
  };
}

export async function claimIdempotencyKey(params: {
  scope: string;
  userId: string;
  key: string;
}): Promise<void> {
  await acquireOperationLease({
    scope: `idempotency:${params.scope}`,
    key: `${params.userId}:${params.key}`,
    ttlSeconds: IDEMPOTENCY_TTL_SECONDS,
    conflictMessage: "This request was already accepted. Refresh saved results before retrying."
  });
  // Intentionally do not release this lease. Its expiry is the replay window,
  // and daily maintenance removes it after that window.
}

export function assertAllowedModels(modelIds: string[]): void {
  const allowed = new Set(getAllowedModelIds());
  const blocked = [...new Set(modelIds)].filter((id) => !allowed.has(id));
  if (blocked.length) {
    throw new ApiError(400, `Model is not enabled for this deployment: ${blocked.join(", ")}`);
  }
}

export function assertModelPricingAvailable(
  modelIds: string[],
  pricingByModel: ModelPricingMap
): void {
  const unavailable = [...new Set(modelIds)].filter((modelId) => {
    const pricing = pricingByModel[modelId];
    return parsePricingValue(pricing?.prompt) === undefined
      || parsePricingValue(pricing?.completion) === undefined;
  });
  if (unavailable.length) {
    throw new ApiError(
      503,
      `Generation is disabled because enforceable pricing is unavailable for: ${unavailable.join(", ")}`
    );
  }
}

export function assertResearchAvailable(enabled = true): void {
  if (enabled && !getOptionalEnv("FIRECRAWL_API_KEY")) {
    throw new ApiError(503, "Web research is not configured for this deployment.");
  }
}

export async function assertAttachmentQuota(userId: string, incomingBytes: number): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("attachment_storage_usage_bytes", {
    p_user_id: userId
  });
  if (error) throw guardrailUnavailable(error);

  const usedBytes = Number(data) || 0;
  const maxBytes = getMaxUserAttachmentStorageBytes();
  if (incomingBytes < 0 || usedBytes + incomingBytes > maxBytes) {
    throw new ApiError(
      413,
      `Attachment storage quota exceeded (${formatMegabytes(usedBytes)} of ${formatMegabytes(maxBytes)} used).`
    );
  }
}

export async function reserveCompletionBudget(params: {
  userId: string;
  modelId: string;
  messages: ChatCompletionMessageParam[];
  maxTokens: number;
  pricing?: ModelPricing;
}): Promise<string | undefined> {
  assertAllowedModels([params.modelId]);

  const promptPrice = parseRequiredPrice(params.modelId, "prompt", params.pricing?.prompt);
  const completionPrice = parseRequiredPrice(params.modelId, "completion", params.pricing?.completion);
  const prompt = completionPromptText(params.messages);
  const promptBytes = Buffer.byteLength(prompt, "utf8");
  if (promptBytes > MAX_MODEL_INPUT_BYTES) {
    throw new ApiError(413, `Model input exceeds the ${MAX_MODEL_INPUT_BYTES}-byte safety limit.`);
  }

  const projectedCost = roundUsd(
    promptBytes * promptPrice + params.maxTokens * completionPrice
  );
  if (projectedCost <= 0) return undefined;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("reserve_usage_budget", {
    p_user_id: params.userId,
    p_amount_usd: projectedCost,
    p_default_budget_usd: getDefaultMonthlyBudgetUsd(),
    p_ttl_seconds: BUDGET_RESERVATION_TTL_SECONDS
  });

  if (error) throw guardrailUnavailable(error);
  const result = firstRow<BudgetReservationRow>(data);
  if (!result) throw new ApiError(503, "Budget service returned no result.");
  if (!result.allowed || !result.reservation_id) {
    const budget = Number(result.budget_usd) || 0;
    const committed = (Number(result.spent_usd) || 0) + (Number(result.reserved_usd) || 0);
    throw new ApiError(
      402,
      `Monthly AI budget reached (${formatUsd(committed)} of ${formatUsd(budget)} committed).`
    );
  }

  return result.reservation_id;
}

export async function releaseCompletionBudget(userId: string, reservationId?: string): Promise<void> {
  if (!reservationId) return;
  const { error } = await createSupabaseAdminClient().rpc("release_usage_budget_reservation", {
    p_user_id: userId,
    p_reservation_id: reservationId
  });
  if (error) {
    logEvent("warn", "Budget reservation release failed", {
      userId,
      reservationId,
      error: getErrorMessage(error)
    });
  }
}

export function completionPromptText(messages: ChatCompletionMessageParam[]): string {
  return messages
    .map((message) => `${message.role}: ${normalizeMessageContent(message.content)}`)
    .join("\n\n");
}

function parseRequiredPrice(
  modelId: string,
  kind: "prompt" | "completion",
  value: string | number | null | undefined
): number {
  const parsed = parsePricingValue(value);
  if (parsed === undefined) {
    throw new ApiError(422, `Pricing is unavailable for ${modelId}; the ${kind} budget cannot be enforced.`);
  }
  return parsed;
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        return String((part as { text: unknown }).text);
      }
      return "";
    })
    .join("");
}

function firstRow<T>(data: unknown): T | undefined {
  if (Array.isArray(data)) return data[0] as T | undefined;
  if (data && typeof data === "object") return data as T;
  return undefined;
}

function guardrailUnavailable(error: unknown): ApiError {
  const message = getErrorMessage(error);
  if (/function .* does not exist|relation .* does not exist|schema cache/i.test(message)) {
    return new ApiError(503, "Production guardrails are not installed. Apply the latest database migration.");
  }
  return new ApiError(503, "Production guardrail service is unavailable.");
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatMegabytes(value: number): string {
  return `${Math.ceil(value / (1024 * 1024))} MB`;
}
