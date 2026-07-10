import { describe, expect, it } from "vitest";
import { localRedirectPath } from "@/lib/urls";

describe("localRedirectPath", () => {
  it("keeps application-local paths", () => {
    expect(localRedirectPath("/app/chats/1?tab=trace#latest")).toBe("/app/chats/1?tab=trace#latest");
  });

  it.each([
    "https://example.com",
    "//example.com/path",
    "/\\example.com/path",
    "javascript:alert(1)"
  ])("rejects external redirect target %s", (target) => {
    expect(localRedirectPath(target)).toBe("/app");
  });
});
