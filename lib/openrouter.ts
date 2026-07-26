import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getErrorMessage } from "@/lib/errors";
import { getAppUrl, getEnv, getOptionalEnv } from "@/lib/env";
import {
  completionPromptText,
  releaseCompletionBudget,
  reserveCompletionBudget
} from "@/lib/production-guardrails";
import type { ModelOption, TokenUsage } from "@/lib/types";
import { normalizeUsage } from "@/lib/token-usage";
import type { ModelPricing } from "@/lib/usage";

let client: OpenAI | undefined;

export function getOpenRouterClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: getEnv("OPENROUTER_API_KEY"),
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": getAppUrl(),
        "X-Title": "Personal AI Council"
      },
      maxRetries: 0,
      timeout: 90_000
    });
  }

  return client;
}

export async function fetchOpenRouterModels(): Promise<ModelOption[]> {
  const key = getOptionalEnv("OPENROUTER_API_KEY");
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: key ? { Authorization: `Bearer ${key}` } : undefined,
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`OpenRouter models request failed (${response.status}): ${details || response.statusText}`);
  }

  const body = (await response.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      context_length?: number;
      pricing?: { prompt?: string; completion?: string };
    }>;
  };

  return (body.data ?? []).map((model) => ({
    id: model.id,
    name: model.name ?? model.id,
    contextLength: model.context_length,
    pricing: model.pricing
  }));
}

export type CompletionResult = {
  content: string;
  usage: TokenUsage;
  latencyMs: number;
  budgetReservationId?: string;
};

export async function completeWithOpenRouter(params: {
  model: string;
  messages: ChatCompletionMessageParam[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json_object";
  cacheControl?: boolean;
  signal?: AbortSignal;
  budget?: {
    userId: string;
    pricing?: ModelPricing;
  };
}): Promise<CompletionResult> {
  const started = Date.now();
  const maxTokens = params.maxTokens ?? 1600;
  const budgetReservationId = params.budget
    ? await reserveCompletionBudget({
        userId: params.budget.userId,
        modelId: params.model,
        messages: params.messages,
        maxTokens,
        pricing: params.budget.pricing
      })
    : undefined;
  let response;
  const processedMessages = params.cacheControl
    ? params.messages.map((msg, idx) => {
        if (idx === 0 || idx === 1 || (idx === params.messages.length - 1 && params.messages.length > 2)) {
          return { ...msg, cache_control: { type: "ephemeral" as const } };
        }
        return msg;
      })
    : params.messages;
  try {
    response = await getOpenRouterClient().chat.completions.create({
      model: params.model,
      messages: processedMessages as typeof params.messages,
      temperature: params.temperature ?? 0.4,
      max_tokens: maxTokens,
      response_format: params.responseFormat ? { type: params.responseFormat } : undefined
    }, { signal: params.signal });
  } catch (error) {
    if (params.budget) {
      await releaseCompletionBudget(params.budget.userId, budgetReservationId);
    }
    if (params.signal?.aborted || isAbortLikeError(error)) {
      const abortError = new Error("OpenRouter request was aborted.");
      abortError.name = "AbortError";
      throw abortError;
    }
    throw new Error(`OpenRouter request failed for ${params.model}: ${getErrorMessage(error)}`);
  }

  if (!response.choices.length) {
    if (params.budget) {
      await releaseCompletionBudget(params.budget.userId, budgetReservationId);
    }
    throw new Error(`OpenRouter returned no choices for ${params.model}.`);
  }

  const content = normalizeMessageContent(response.choices[0]?.message?.content);
  if (!content.trim()) {
    if (params.budget) {
      await releaseCompletionBudget(params.budget.userId, budgetReservationId);
    }
    throw new Error(`OpenRouter returned an empty response for ${params.model}.`);
  }

  const promptText = completionPromptText(params.messages);

  return {
    content,
    usage: normalizeUsage(response.usage, promptText, content),
    latencyMs: Date.now() - started,
    budgetReservationId
  };
}

function isAbortLikeError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.name === "APIUserAbortError";
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
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
  return "";
}
