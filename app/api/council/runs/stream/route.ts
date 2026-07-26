import { jsonError, parseJsonBody } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { requireApiProfile } from "@/lib/auth";
import { runCouncil } from "@/lib/council";
import { isCouncilAbortError } from "@/lib/council/abort";
import { getErrorLog } from "@/lib/errors";
import { logEvent, reportError } from "@/lib/observability";
import {
  acquireOperationLease,
  assertAllowedModels,
  assertResearchAvailable,
  claimIdempotencyKey,
  enforceRateLimit,
  type OperationLease
} from "@/lib/production-guardrails";
import { assertTrustedOrigin, requireIdempotencyKey } from "@/lib/request-security";
import { councilRunSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

const HEARTBEAT_INTERVAL_MS = 15_000;
const FUNCTION_DEADLINE_MS = 280_000;

export async function POST(request: Request) {
  const requestId =
    request.headers.get("x-vercel-id") ??
    request.headers.get("x-request-id") ??
    crypto.randomUUID();
  const requestStarted = Date.now();
  let lease: OperationLease | undefined;
  let streamStarted = false;

  try {
    assertTrustedOrigin(request);
    const profile = await requireApiProfile();
    const input = councilRunSchema.parse(await parseJsonBody(request));
    const idempotencyKey = requireIdempotencyKey(request);
    assertAllowedModels([...input.models, input.judgeModel]);
    assertResearchAvailable(input.researchEnabled);
    await enforceRateLimit({
      scope: "council-run",
      key: profile.id,
      limit: 12,
      windowSeconds: 60 * 60,
      message: "Council run limit reached. Try again later."
    });
    lease = await acquireOperationLease({
      scope: "ai-operation",
      key: profile.id,
      ttlSeconds: 6 * 60,
      conflictMessage: "Another AI operation is already running for this account."
    });
    await claimIdempotencyKey({
      scope: "council-run",
      userId: profile.id,
      key: idempotencyKey
    });
    const encoder = new TextEncoder();

    logEvent("info", "Council stream starting", {
      requestId,
      userId: profile.id,
      modelCount: input.models.length,
      judgeModel: input.judgeModel,
      debateDepth: input.debateDepth,
      researchEnabled: input.researchEnabled,
      saveHistory: input.saveHistory
    });

    const runAbortController = new AbortController();
    let closed = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let terminalEventSent = false;

    const abortRun = (reason?: unknown) => {
      if (!runAbortController.signal.aborted) runAbortController.abort(reason);
    };
    const abortFromRequest = () => abortRun(request.signal.reason);
    if (request.signal.aborted) abortFromRequest();
    else request.signal.addEventListener("abort", abortFromRequest, { once: true });
    deadline = setTimeout(() => {
      const timeoutError = new Error("Council run timed out before completion.");
      timeoutError.name = "TimeoutError";
      abortRun(timeoutError);
    }, FUNCTION_DEADLINE_MS);

    const cleanup = () => {
      request.signal.removeEventListener("abort", abortFromRequest);
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = undefined;
      }
      if (deadline) {
        clearTimeout(deadline);
        deadline = undefined;
      }
    };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const sendBlock = (block: string): boolean => {
          if (closed) return false;
          try {
            controller.enqueue(encoder.encode(block));
            return true;
          } catch (error) {
            closed = true;
            abortRun(error);
            logEvent("warn", "Council stream send failed", {
              requestId,
              ...getErrorLog(error)
            });
            return false;
          }
        };
        const send = (event: unknown, type = "message") =>
          sendBlock(`event: ${type}\ndata: ${JSON.stringify(event)}\n\n`);

        sendBlock(": connected\n\n");
        heartbeat = setInterval(() => sendBlock(": heartbeat\n\n"), HEARTBEAT_INTERVAL_MS);

        runCouncil(input, {
          userId: profile.id,
          userEmail: profile.email,
          signal: runAbortController.signal,
          onEvent: async (event) => {
            if (event.type === "complete" || event.type === "error") terminalEventSent = true;
            send(event, event.type);
          }
        })
          .catch((error) => {
            if (isCouncilAbortError(error, runAbortController.signal)) {
              logEvent("info", "Council run stopped", {
                requestId,
                userId: profile.id,
                modelCount: input.models.length,
                judgeModel: input.judgeModel
              });
              return;
            }
            void reportError(error, {
              requestId,
              route: "/api/council/runs/stream",
              userId: profile.id,
              modelCount: input.models.length,
              judgeModel: input.judgeModel
            });
            if (!terminalEventSent) {
              terminalEventSent = true;
              send(
                {
                  type: "error",
                  message: "Council run failed."
                },
                "error"
              );
            }
          })
          .finally(async () => {
            cleanup();
            await lease?.release();
            if (closed) return;
            closed = true;
            try {
              controller.close();
            } catch (error) {
              logEvent("warn", "Council stream close failed", {
                requestId,
                ...getErrorLog(error)
              });
            }
          });
      },
      cancel(reason) {
        closed = true;
        abortRun(reason);
        cleanup();
        void lease?.release();
      }
    });

    streamStarted = true;
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Request-Id": requestId
      }
    });
  } catch (error) {
    if (lease && !streamStarted) await lease.release();
    if (!(error instanceof ApiError) || error.status >= 500) {
      await reportError(error, {
        requestId,
        route: "/api/council/runs/stream",
        method: "POST",
        durationMs: Date.now() - requestStarted
      });
    } else {
      logEvent("warn", "Council stream request rejected", {
        requestId,
        status: error.status,
        durationMs: Date.now() - requestStarted
      });
    }
    const response = jsonError(error, requestId);
    response.headers.set("X-Request-Id", requestId);
    return response;
  }
}
