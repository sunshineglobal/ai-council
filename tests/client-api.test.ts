import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientApiError, requestJson } from "@/lib/client-api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestJson", () => {
  it("returns typed JSON for successful responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    await expect(requestJson<{ ok: boolean }>("/api/test")).resolves.toEqual({ ok: true });
  });

  it("normalizes API error payloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "No access.", requestId: "request-1" }), { status: 403 })
    );

    const error = await requestJson("/api/test").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ClientApiError);
    expect(error).toMatchObject({ message: "No access.", status: 403, requestId: "request-1" });
  });

  it("rejects invalid successful payloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not-json"));

    await expect(requestJson("/api/test")).rejects.toMatchObject({ status: 502 });
  });
});
