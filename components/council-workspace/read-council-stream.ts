import { parseCouncilStreamBlock } from "@/lib/sse";
import type { CouncilEvent, CouncilRunResult } from "@/lib/types";

export type CouncilStreamOutcome = {
  terminal: boolean;
  result?: CouncilRunResult;
  threadId?: string;
  runId?: string;
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
  let threadId: string | undefined;
  let runId: string | undefined;

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
        ({ terminal, result, threadId, runId } = recordStreamEvent(event, {
          terminal,
          result,
          threadId,
          runId
        }));
        onEvent(event);
      }
    }

    if (buffer.trim()) {
      const event = parseCouncilStreamBlock(buffer);
      if (event) {
        ({ terminal, result, threadId, runId } = recordStreamEvent(event, {
          terminal,
          result,
          threadId,
          runId
        }));
        onEvent(event);
      }
    }

    return { terminal, result, threadId, runId };
  } finally {
    reader.releaseLock();
  }
}

function recordStreamEvent(
  event: CouncilEvent,
  current: CouncilStreamOutcome
): CouncilStreamOutcome {
  if (event.type === "started") {
    return {
      ...current,
      runId: event.runId,
      threadId: event.threadId ?? current.threadId
    };
  }
  if (event.type === "complete") {
    return {
      terminal: true,
      result: event.result,
      threadId: event.result.threadId ?? current.threadId,
      runId: event.result.id
    };
  }
  if (event.type === "error") {
    return {
      terminal: true,
      result: current.result,
      threadId: event.threadId ?? current.threadId,
      runId: event.runId ?? current.runId
    };
  }
  return current;
}
