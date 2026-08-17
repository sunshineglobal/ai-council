import { describe, expect, it } from "vitest";
import { readEvalEventStream } from "@/components/eval-dashboard/read-eval-stream";
import { parseEvalStreamBlock } from "@/lib/sse";

describe("eval stream parsing", () => {
  it("parses a scored-item event", () => {
    expect(parseEvalStreamBlock(
      'event: item_scored\ndata: {"type":"item_scored","evalRunId":"e1","itemIndex":0,"total":2,"prompt":"Q","score":80,"rationale":"Good","finalAnswer":"A"}'
    )).toMatchObject({
      type: "item_scored",
      evalRunId: "e1",
      score: 80
    });
  });

  it("reads a complete terminal event from the stream", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(
          'event: started\ndata: {"type":"started","evalRunId":"e1","total":1,"completed":0}\n\n'
        ));
        controller.enqueue(encoder.encode(
          'event: complete\ndata: {"type":"complete","evalRunId":"e1","aggregateScore":72,"scored":1,"total":1}\n\n'
        ));
        controller.close();
      }
    });

    const types: string[] = [];
    const outcome = await readEvalEventStream(body, (event) => types.push(event.type));
    expect(types).toEqual(["started", "complete"]);
    expect(outcome.terminal).toBe(true);
    expect(outcome.event).toMatchObject({ type: "complete", aggregateScore: 72 });
  });
});
