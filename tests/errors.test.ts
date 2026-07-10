import { describe, expect, it } from "vitest";
import { getErrorLog, getErrorMessage } from "@/lib/errors";

describe("getErrorMessage", () => {
  it("uses Error and non-empty string messages", () => {
    expect(getErrorMessage(new Error("Request failed."))).toBe("Request failed.");
    expect(getErrorMessage("Provider timed out.")).toBe("Provider timed out.");
  });

  it("combines structured provider error details", () => {
    expect(
      getErrorMessage({
        message: "Invalid request.",
        status: 422,
        code: "bad_prompt",
        details: "Prompt was empty.",
        hint: "Add a prompt."
      })
    ).toBe("Invalid request. status 422 code bad_prompt Prompt was empty. Hint: Add a prompt.");
  });

  it("uses the supplied fallback for unsupported values", () => {
    expect(getErrorMessage(null, "Fallback message.")).toBe("Fallback message.");
    expect(getErrorMessage("   ", "Fallback message.")).toBe("Fallback message.");
  });
});

describe("getErrorLog", () => {
  it("normalizes Error instances for logging", () => {
    const error = new TypeError("Invalid value.");

    expect(getErrorLog(error)).toMatchObject({
      name: "TypeError",
      message: "Invalid value."
    });
  });

  it("keeps safe fields from structured errors", () => {
    expect(
      getErrorLog({
        name: "ProviderError",
        message: "Rate limited.",
        status: 429,
        code: "rate_limit",
        details: "Try later.",
        hint: "Retry with backoff.",
        ignored: "not logged"
      })
    ).toEqual({
      name: "ProviderError",
      message: "Rate limited.",
      status: 429,
      code: "rate_limit",
      details: "Try later.",
      hint: "Retry with backoff."
    });
  });
});
