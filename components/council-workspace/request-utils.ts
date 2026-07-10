export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "APIUserAbortError");
}

export async function readResponseError(response: Response, fallback = "Council request failed"): Promise<string> {
  const text = await response.text().catch(() => "");
  const statusMessage = `${fallback} with status ${response.status}.`;
  if (!text) return statusMessage;

  try {
    const body = JSON.parse(text) as { error?: unknown };
    return typeof body.error === "string" ? body.error : statusMessage;
  } catch {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 180);
    return preview || statusMessage;
  }
}
