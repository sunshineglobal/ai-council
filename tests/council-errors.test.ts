import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-error";
import { toUserFacingCouncilError } from "@/lib/council/errors";

describe("toUserFacingCouncilError", () => {
  it("maps abort and timeout reasons", () => {
    const stopped = new DOMException("Aborted", "AbortError");
    expect(toUserFacingCouncilError(stopped, AbortSignal.abort())).toBe("Council run stopped.");

    const timeoutSignal = AbortSignal.abort(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    expect(toUserFacingCouncilError(stopped, timeoutSignal)).toBe("Council run timed out before completion.");
  });

  it("keeps ApiError and safe validation messages", () => {
    expect(toUserFacingCouncilError(new ApiError(402, "Budget exhausted."))).toBe("Budget exhausted.");
    expect(toUserFacingCouncilError(new Error("Choose at least one council model."))).toBe(
      "Choose at least one council model."
    );
  });

  it("hides internal provider dumps", () => {
    expect(toUserFacingCouncilError(new Error("OpenRouter returned 500 boom"))).toBe("Council run failed.");
  });
});
