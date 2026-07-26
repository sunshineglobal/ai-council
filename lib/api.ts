import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "@/lib/api-error";
import { getErrorLog } from "@/lib/errors";
import { logEvent, reportError } from "@/lib/observability";
import { assertTrustedOrigin } from "@/lib/request-security";

const MAX_JSON_BODY_BYTES = 256 * 1024;

export async function parseJsonBody<T = unknown>(request: Request): Promise<T> {
  const text = await readBoundedText(request, MAX_JSON_BODY_BYTES);

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApiError(400, "Invalid JSON request body.");
    }
    throw error;
  }
}

async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiError(413, "JSON request body is too large.");
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ApiError(413, "JSON request body is too large.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export function jsonError(error: unknown, existingRequestId?: string) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers: error.headers }
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const requestId = existingRequestId ?? crypto.randomUUID();
  if (!existingRequestId && process.env.NODE_ENV !== "test") {
    console.error("[api] unhandled request error", { requestId, ...getErrorLog(error) });
  }
  return NextResponse.json(
    { error: "The request could not be completed.", requestId },
    { status: 500 }
  );
}

type RouteHandler<Args extends unknown[]> = (...args: Args) => Response | Promise<Response>;

export function apiRoute<Args extends unknown[]>(handler: RouteHandler<Args>) {
  return async (...args: Args): Promise<Response> => {
    const request = args[0] instanceof Request ? args[0] : undefined;
    const requestId =
      request?.headers.get("x-vercel-id") ??
      request?.headers.get("x-request-id") ??
      crypto.randomUUID();
    const started = Date.now();
    const route = request ? new URL(request.url).pathname : "unknown";

    try {
      if (request) assertTrustedOrigin(request);
      logEvent("info", "API request started", {
        requestId,
        route,
        method: request?.method
      });
      const response = await handler(...args);
      response.headers.set("X-Request-Id", requestId);
      logEvent("info", "API request completed", {
        requestId,
        route,
        method: request?.method,
        status: response.status,
        durationMs: Date.now() - started
      });
      return response;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status >= 500) {
        await reportError(error, {
          requestId,
          route,
          method: request?.method,
          durationMs: Date.now() - started
        });
      } else {
        logEvent("warn", "API request rejected", {
          requestId,
          route,
          method: request?.method,
          status: error.status,
          durationMs: Date.now() - started
        });
      }
      const response = jsonError(error, requestId);
      response.headers.set("X-Request-Id", requestId);
      return response;
    }
  };
}
