import type { EvalEvent } from "@/lib/evals/events";
import type { CouncilEvent } from "@/lib/types";

export function parseCouncilStreamBlock(block: string): CouncilEvent | null {
  return parseSseJsonBlock<CouncilEvent>(block, "Council stream");
}

export function parseEvalStreamBlock(block: string): EvalEvent | null {
  return parseSseJsonBlock<EvalEvent>(block, "Eval stream");
}

export function parseSseJsonBlock<T>(block: string, label: string): T | null {
  const lines = block.split(/\r?\n/);
  const dataLines: string[] = [];
  let eventName = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) return null;

  const data = dataLines.join("\n");
  try {
    return JSON.parse(data) as T;
  } catch {
    throw new Error(`${label} returned invalid data${eventName ? ` for ${eventName}` : ""}: ${preview(data)}`);
  }
}

function preview(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "empty payload";
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}
