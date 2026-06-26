import { describe, expect, it } from "vitest";
import { parseCouncilStreamBlock } from "@/lib/sse";

describe("council stream parsing", () => {
  it("parses a council event from an SSE block", () => {
    const event = parseCouncilStreamBlock('event: stage\ndata: {"type":"stage","stage":"initial_answer","message":"Collecting"}');

    expect(event).toEqual({
      type: "stage",
      stage: "initial_answer",
      message: "Collecting"
    });
  });

  it("throws a useful error for invalid event data", () => {
    expect(() => parseCouncilStreamBlock("event: error\ndata: <html>Server error</html>")).toThrow(
      /Council stream returned invalid data for error/
    );
  });

  it("ignores heartbeat blocks without data", () => {
    expect(parseCouncilStreamBlock(": keepalive")).toBeNull();
  });
});
