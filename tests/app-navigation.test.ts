import { describe, expect, it } from "vitest";
import { isCurrentPath } from "@/components/app-navigation-path";

describe("app navigation current path", () => {
  it("treats saved chats as the council page", () => {
    expect(isCurrentPath("/app", "/app")).toBe(true);
    expect(isCurrentPath("/app/chats/abc", "/app")).toBe(true);
    expect(isCurrentPath("/app/usage", "/app")).toBe(false);
    expect(isCurrentPath("/app/evals", "/app")).toBe(false);
  });

  it("marks usage as current without matching council", () => {
    expect(isCurrentPath("/app/usage", "/app/usage")).toBe(true);
    expect(isCurrentPath("/app/evals", "/app/usage")).toBe(false);
  });
});
