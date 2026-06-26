import { jsonError } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { runCouncil } from "@/lib/council";
import { getErrorLog, getErrorMessage } from "@/lib/errors";
import { councilRunSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

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

    let closed = false;
    const stream = new ReadableStream({
      start(controller) {
        const closeFromAbort = () => {
          closed = true;
        };
        request.signal.addEventListener("abort", closeFromAbort, { once: true });

        const send = (event: unknown, type = "message") => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(event)}\n\n`));
          } catch (error) {
            closed = true;
            console.warn("[council.stream] could not send event to client", getErrorLog(error));
          }
        };

        runCouncil(input, {
          userId: profile.id,
          userEmail: profile.email,
          signal: request.signal,
          onEvent: async (event) => send(event, event.type)
        })
          .catch((error) => {
            if (request.signal.aborted || isAbortLikeError(error)) {
              console.info("[council.stream] run stopped", {
                userId: profile.id,
                modelCount: input.models.length,
                judgeModel: input.judgeModel
              });
              return;
            }
            const message = getErrorMessage(error, "Council run failed.");
            console.error("[council.stream] run failed", {
              userId: profile.id,
              modelCount: input.models.length,
              judgeModel: input.judgeModel,
              ...getErrorLog(error)
            });
            send(
              {
                type: "error",
                message
              },
              "error"
            );
          })
          .finally(() => {
            request.signal.removeEventListener("abort", closeFromAbort);
            if (closed) return;
            closed = true;
            try {
              controller.close();
            } catch (error) {
              console.warn("[council.stream] could not close stream", getErrorLog(error));
            }
          });
      },
      cancel() {
        closed = true;
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    console.error("[council.stream] request failed before stream start", getErrorLog(error));
    return jsonError(error);
  }
}

function isAbortLikeError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.name === "APIUserAbortError";
}
