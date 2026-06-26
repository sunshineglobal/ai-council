import { describe, expect, it } from "vitest";
import { z } from "zod";
import { jsonError } from "@/lib/api";

describe("jsonError", () => {
  it("returns 400 for validation errors", async () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 1 });
    if (result.success) throw new Error("Expected validation to fail.");

    const response = jsonError(result.error);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
  });
});
