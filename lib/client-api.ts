type ApiErrorPayload = {
  error?: unknown;
  requestId?: unknown;
};

export class ClientApiError extends Error {
  readonly status: number;
  readonly requestId?: string;

  constructor(message: string, status: number, requestId?: string) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const text = await response.text();
  const body = parseJson(text);

  if (!response.ok) {
    const payload = isRecord(body) ? (body as ApiErrorPayload) : undefined;
    const message = typeof payload?.error === "string"
      ? payload.error
      : `Request failed with status ${response.status}.`;
    const requestId = typeof payload?.requestId === "string" ? payload.requestId : undefined;
    throw new ClientApiError(message, response.status, requestId);
  }

  return body as T;
}

function parseJson(text: string): unknown {
  if (!text.trim()) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ClientApiError("The server returned an invalid response.", 502);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
