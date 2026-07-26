import { NextResponse } from "next/server";
import { apiRoute, parseJsonBody } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { requireApiProfile } from "@/lib/auth";
import { runEval } from "@/lib/evals/service";
import {
  acquireOperationLease,
  assertAllowedModels,
  assertResearchAvailable,
  claimIdempotencyKey,
  enforceRateLimit
} from "@/lib/production-guardrails";
import { requireIdempotencyKey } from "@/lib/request-security";
import { evalRunSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;
const FUNCTION_DEADLINE_MS = 280_000;

export const POST = apiRoute(async (request: Request) => {
  const profile = await requireApiProfile();
  const input = evalRunSchema.parse(await parseJsonBody(request));
  const idempotencyKey = requireIdempotencyKey(request);
  assertAllowedModels([...input.models, input.judgeModel]);
  assertResearchAvailable(input.researchEnabled);
  await enforceRateLimit({
    scope: "eval-run",
    key: profile.id,
    limit: 2,
    windowSeconds: 60 * 60,
    message: "Eval limit reached. Try again later."
  });
  const lease = await acquireOperationLease({
    scope: "ai-operation",
    key: profile.id,
    ttlSeconds: 6 * 60,
    conflictMessage: "Another AI operation is already running for this account."
  });

  try {
    await claimIdempotencyKey({
      scope: "eval-run",
      userId: profile.id,
      key: idempotencyKey
    });
    const deadlineSignal = AbortSignal.timeout(FUNCTION_DEADLINE_MS);
    const signal = AbortSignal.any([request.signal, deadlineSignal]);
    try {
      return NextResponse.json(await runEval({ profile, input, signal }));
    } catch (error) {
      if (deadlineSignal.aborted && !request.signal.aborted) {
        throw new ApiError(504, "Eval timed out before completion.");
      }
      throw error;
    }
  } finally {
    await lease.release();
  }
});
