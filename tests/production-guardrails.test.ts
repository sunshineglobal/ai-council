import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertAllowedModels,
  assertModelPricingAvailable,
  assertResearchAvailable,
  completionPromptText
} from "@/lib/production-guardrails";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("production guardrails", () => {
  it("blocks models outside the deployment allowlist", () => {
    vi.stubEnv("ALLOWED_MODEL_IDS", "provider/allowed");

    expect(() => assertAllowedModels(["provider/allowed"])).not.toThrow();
    expect(() => assertAllowedModels(["provider/blocked"])).toThrow(/not enabled/);
  });

  it("normalizes message content for conservative budget estimation", () => {
    expect(completionPromptText([
      { role: "system", content: "Be concise." },
      {
        role: "user",
        content: [{ type: "text", text: "Question" }]
      }
    ])).toBe("system: Be concise.\n\nuser: Question");
  });

  it("fails closed when research is requested without Firecrawl configuration", () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");

    expect(() => assertResearchAvailable(false)).not.toThrow();
    expect(() => assertResearchAvailable(true)).toThrow(/not configured/);
  });

  it("requires enforceable pricing for every selected model", () => {
    expect(() => assertModelPricingAvailable(
      ["provider/ready"],
      { "provider/ready": { prompt: "0.000001", completion: "0.000002" } }
    )).not.toThrow();
    expect(() => assertModelPricingAvailable(
      ["provider/missing"],
      { "provider/missing": { prompt: "0.000001" } }
    )).toThrow(/pricing is unavailable/);
  });
});
