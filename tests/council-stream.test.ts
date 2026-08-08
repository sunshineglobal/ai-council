import { describe, expect, it } from "vitest";
import { readCouncilEventStream } from "@/components/council-workspace/read-council-stream";

describe("readCouncilEventStream", () => {
  it("captures thread and run ids from started and error events", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(
          'event: message\ndata: {"type":"started","runId":"run-1","threadId":"thread-1"}\n\n'
        ));
        controller.enqueue(encoder.encode(
          'event: message\ndata: {"type":"error","message":"Council run failed.","runId":"run-1","threadId":"thread-1"}\n\n'
        ));
        controller.close();
      }
    });

    const events: string[] = [];
    const outcome = await readCouncilEventStream(body, (event) => events.push(event.type));
    expect(events).toEqual(["started", "error"]);
    expect(outcome).toEqual({
      terminal: true,
      result: undefined,
      threadId: "thread-1",
      runId: "run-1"
    });
  });
});
