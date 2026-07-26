import { getErrorLog } from "@/lib/errors";

export type LogLevel = "info" | "warn" | "error";

export function logEvent(
  level: LogLevel,
  message: string,
  fields: Record<string, unknown> = {}
): void {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields
  });

  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export async function reportError(
  error: unknown,
  context: Record<string, unknown> = {}
): Promise<void> {
  const payload = {
    timestamp: new Date().toISOString(),
    level: "error",
    message: "Unhandled application error",
    ...context,
    error: getErrorLog(error)
  };
  console.error(JSON.stringify(payload));

  const webhook = process.env.ERROR_WEBHOOK_URL;
  if (!webhook) return;

  try {
    const url = new URL(webhook);
    if (url.protocol !== "https:") throw new Error("ERROR_WEBHOOK_URL must use HTTPS.");
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3_000)
    });
  } catch (webhookError) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      message: "Error webhook delivery failed",
      error: getErrorLog(webhookError)
    }));
  }
}
