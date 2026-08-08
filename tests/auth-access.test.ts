import { describe, expect, it } from "vitest";

describe("established profile access policy", () => {
  it("documents that existing profiles remain allowed without a live invite row", () => {
    const decision = resolveAccess({
      hasProfile: true,
      inviteAllowed: false,
      isBootstrapAdmin: false
    });
    expect(decision).toBe("allow-profile");
  });

  it("still requires an invite for first-time profile creation", () => {
    expect(resolveAccess({
      hasProfile: false,
      inviteAllowed: false,
      isBootstrapAdmin: false
    })).toBe("deny");
    expect(resolveAccess({
      hasProfile: false,
      inviteAllowed: true,
      isBootstrapAdmin: false
    })).toBe("create-profile");
  });
});

function resolveAccess(input: {
  hasProfile: boolean;
  inviteAllowed: boolean;
  isBootstrapAdmin: boolean;
}): "allow-profile" | "create-profile" | "deny" {
  if (input.hasProfile) return "allow-profile";
  if (input.inviteAllowed || input.isBootstrapAdmin) return "create-profile";
  return "deny";
}
