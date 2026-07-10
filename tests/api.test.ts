import { describe, expect, it } from "vitest";
import { z } from "zod";
import { apiRoute, jsonError } from "@/lib/api";
import { ApiError } from "@/lib/api-error";

describe("jsonError", () => {
  it("returns 400 for validation errors", async () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 1 });
    if (result.success) throw new Error("Expected validation to fail.");

    const response = jsonError(result.error);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it("preserves the status and message from ApiError", async () => {
    const response = jsonError(new ApiError(403, "Invite required."));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Invite required." });
  });

  it("does not expose internal Error messages", async () => {
    const response = jsonError(new Error("Provider unavailable."));
    const body = (await response.json()) as { error: string; requestId: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe("The request could not be completed.");
    expect(body.requestId).toBeTruthy();
  });

  it("does not expose arbitrary unknown values", async () => {
    const response = jsonError({ secret: "internal context" });
    const body = (await response.json()) as { error: string; requestId: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe("The request could not be completed.");
    expect(body.requestId).toBeTruthy();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = jsonError(new SyntaxError("Unexpected token"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON request body." });
  });
});

describe("apiRoute", () => {
  it("passes handler arguments through", async () => {
    const handler = apiRoute(async (value: string) => Response.json({ value }));

    await expect((await handler("ok")).json()).resolves.toEqual({ value: "ok" });
  });

  it("normalizes thrown errors", async () => {
    const handler = apiRoute(async () => {
      throw new ApiError(404, "Missing.");
    });

    const response = await handler();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Missing." });
  });
});
