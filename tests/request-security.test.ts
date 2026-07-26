import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import {
  assertRequestSize,
  assertTrustedOrigin,
  bearerTokenMatches,
  hashGuardrailKey,
  requireIdempotencyKey
} from "@/lib/request-security";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("request security", () => {
  it("rejects cross-origin state-changing requests", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://council.example.com");
    const request = new Request("https://council.example.com/api/files", {
      method: "POST",
      headers: { origin: "https://attacker.example" }
    });

    expect(() => assertTrustedOrigin(request)).toThrow(ApiError);
  });

  it("accepts state-changing requests from the configured origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://council.example.com");
    const request = new Request("https://internal-host.example/api/files", {
      method: "POST",
      headers: { origin: "https://council.example.com" }
    });

    expect(() => assertTrustedOrigin(request)).not.toThrow();
  });

  it("rejects oversized requests using the declared content length", () => {
    const request = new Request("https://council.example.com/api/test", {
      method: "POST",
      headers: { "content-length": "1025" }
    });

    expect(() => assertRequestSize(request, 1024)).toThrow(/limit/);
  });

  it("compares bearer credentials exactly and hashes identifiers", () => {
    const request = new Request("https://council.example.com/api/cron", {
      headers: { authorization: "Bearer correct-secret" }
    });

    expect(bearerTokenMatches(request, "correct-secret")).toBe(true);
    expect(bearerTokenMatches(request, "wrong-secret")).toBe(false);
    expect(hashGuardrailKey("user@example.com")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashGuardrailKey("user@example.com")).not.toContain("user");
  });

  it("requires a UUID idempotency key", () => {
    const valid = new Request("https://council.example.com/api/test", {
      headers: { "idempotency-key": "019f8eac-8d09-7a13-a779-4bd37cb06743" }
    });
    const invalid = new Request("https://council.example.com/api/test", {
      headers: { "idempotency-key": "repeat-me" }
    });

    expect(requireIdempotencyKey(valid)).toBe("019f8eac-8d09-7a13-a779-4bd37cb06743");
    expect(() => requireIdempotencyKey(invalid)).toThrow(/Idempotency-Key/);
  });
});
