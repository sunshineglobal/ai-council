import { parseCouncilStreamBlock } from "@/lib/sse";
import type { CouncilEvent, CouncilRunResult } from "@/lib/types";

export type CouncilStreamOutcome = {
  terminal: boolean;
  result?: CouncilRunResult;
};

export async function readCouncilEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: CouncilEvent) => void
): Promise<CouncilStreamOutcome> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  let result: CouncilRunResult | undefined;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const event = parseCouncilStreamBlock(block);
        if (!event) continue;
        ({ terminal, result } = recordTerminalEvent(event, terminal, result));
        onEvent(event);
      }
    }

    if (buffer.trim()) {
      const event = parseCouncilStreamBlock(buffer);
      if (event) {
        ({ terminal, result } = recordTerminalEvent(event, terminal, result));
        onEvent(event);
      }
    }

    return { terminal, result };
  } finally {
    reader.releaseLock();
  }
}

function recordTerminalEvent(
  event: CouncilEvent,
  terminal: boolean,
  result?: CouncilRunResult
): CouncilStreamOutcome {
  if (event.type === "complete") return { terminal: true, result: event.result };
  if (event.type === "error") return { terminal: true, result };
  return { terminal, result };
}
