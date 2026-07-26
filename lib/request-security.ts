import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api-error";
import { getAppUrl } from "@/lib/env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function assertTrustedOrigin(request: Request): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = new URL(getAppUrl()).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (origin && origin !== requestOrigin && origin !== configuredOrigin) {
    throw new ApiError(403, "Cross-origin request rejected.");
  }

  if (!origin && fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new ApiError(403, "Cross-site request rejected.");
  }
}

export function assertRequestSize(request: Request, maxBytes: number): void {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return;

  const bytes = Number(contentLength);
  if (Number.isFinite(bytes) && bytes > maxBytes) {
    throw new ApiError(413, `Request body exceeds the ${formatBytes(maxBytes)} limit.`);
  }
}

export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function requireIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, "A UUID Idempotency-Key header is required.");
  }
  return value.toLowerCase();
}

export function hashGuardrailKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function bearerTokenMatches(request: Request, expected: string): boolean {
  const actual = request.headers.get("authorization");
  const expectedHeader = `Bearer ${expected}`;
  if (!actual || actual.length !== expectedHeader.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expectedHeader));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${Math.ceil(bytes / (1024 * 1024))} MB`;
}
