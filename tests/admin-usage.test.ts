import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-error";
import { parseUsageRange } from "@/lib/admin/usage";

describe("parseUsageRange", () => {
  it("normalizes a valid half-open range", () => {
    const url = new URL("https://example.test/api/admin/usage?from=2026-07-01&to=2026-08-01");

    expect(parseUsageRange(url)).toEqual({
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-08-01T00:00:00.000Z"
    });
  });

  it("rejects missing, invalid, and reversed ranges", () => {
    const invalidUrls = [
      "https://example.test/api/admin/usage",
      "https://example.test/api/admin/usage?from=nope&to=2026-08-01",
      "https://example.test/api/admin/usage?from=2026-08-01&to=2026-07-01"
    ];

    for (const value of invalidUrls) {
      expect(() => parseUsageRange(new URL(value))).toThrow(ApiError);
    }
  });
});
