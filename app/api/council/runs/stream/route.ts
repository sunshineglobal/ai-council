import { jsonError } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { runCouncil } from "@/lib/council";
import { isCouncilAbortError } from "@/lib/council/abort";
import { getErrorLog } from "@/lib/errors";
import { councilRunSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

const HEARTBEAT_INTERVAL_MS = 15_000;

export async function POST(request: Request) {
  try {
    const profile = await requireApiProfile();
    const input = councilRunSchema.parse(await request.json());
    const encoder = new TextEncoder();

    console.info("[council.stream] starting run", {
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
    let terminalEventSent = false;

    const abortRun = (reason?: unknown) => {
      if (!runAbortController.signal.aborted) runAbortController.abort(reason);
    };
    const abortFromRequest = () => abortRun(request.signal.reason);
    if (request.signal.aborted) abortFromRequest();
    else request.signal.addEventListener("abort", abortFromRequest, { once: true });

    const cleanup = () => {
      request.signal.removeEventListener("abort", abortFromRequest);
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = undefined;
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
            console.warn("[council.stream] could not send event to client", getErrorLog(error));
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
              console.info("[council.stream] run stopped", {
                userId: profile.id,
                modelCount: input.models.length,
                judgeModel: input.judgeModel
              });
              return;
            }
            console.error("[council.stream] run failed", {
              userId: profile.id,
              modelCount: input.models.length,
              judgeModel: input.judgeModel,
              ...getErrorLog(error)
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
          .finally(() => {
            cleanup();
            if (closed) return;
            closed = true;
            try {
              controller.close();
            } catch (error) {
              console.warn("[council.stream] could not close stream", getErrorLog(error));
            }
          });
      },
      cancel(reason) {
        closed = true;
        abortRun(reason);
        cleanup();
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    console.error("[council.stream] request failed before stream start", getErrorLog(error));
    return jsonError(error);
  }
}
