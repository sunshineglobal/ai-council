import { ApiError } from "@/lib/api-error";
import { isCouncilAbortError } from "@/lib/council/abort";
import { getErrorMessage } from "@/lib/errors";

const SAFE_PREFIXES = [
  "Prompt ",
  "Choose ",
  "Attach ",
  "Council ",
  "Debate ",
  "Judge ",
  "Research ",
  "Monthly budget",
  "Model ",
  "File ",
  "Budget ",
  "Rate limit",
  "Another "
];

export function toUserFacingCouncilError(error: unknown, signal?: AbortSignal | null): string {
  if (isCouncilAbortError(error, signal ?? undefined)) {
    if (signal?.reason instanceof Error && signal.reason.name === "TimeoutError") {
      return "Council run timed out before completion.";
    }
    return "Council run stopped.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  const message = getErrorMessage(error, "");
  if (message && SAFE_PREFIXES.some((prefix) => message.startsWith(prefix))) {
    return message;
  }

  return "Council run failed.";
}
