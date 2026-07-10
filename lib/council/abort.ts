export function isCouncilAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.name === "APIUserAbortError";
}

export function throwIfCouncilAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;

  const error = new Error("Council run stopped.");
  error.name = "AbortError";
  throw error;
}
