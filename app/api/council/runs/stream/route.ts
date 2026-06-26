import { jsonError } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { runCouncil } from "@/lib/council";
import { councilRunSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const profile = await requireApiProfile();
    const input = councilRunSchema.parse(await request.json());
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const send = (event: unknown, type = "message") => {
          controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(event)}\n\n`));
        };

        runCouncil(input, {
          userId: profile.id,
          userEmail: profile.email,
          onEvent: async (event) => send(event, event.type)
        })
          .catch((error) => {
            send(
              {
                type: "error",
                message: error instanceof Error ? error.message : "Council run failed."
              },
              "error"
            );
          })
          .finally(() => controller.close());
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
    return jsonError(error);
  }
}
