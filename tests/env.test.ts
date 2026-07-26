import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAllowedModelIds,
  getAppUrl,
  getDefaultMonthlyBudgetUsd,
  validateProductionConfig
} from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("production configuration", () => {
  it("requires an HTTPS application URL in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://example.com");

    expect(() => getAppUrl()).toThrow(/HTTPS/);
  });

  it("normalizes the application URL to its origin", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://council.example.com/path");

    expect(getAppUrl()).toBe("https://council.example.com");
  });

  it("deduplicates the model allowlist", () => {
    vi.stubEnv("ALLOWED_MODEL_IDS", "model/a, model/b,model/a");

    expect(getAllowedModelIds()).toEqual(["model/a", "model/b"]);
  });

  it("rejects invalid enforced budget values", () => {
    vi.stubEnv("DEFAULT_MONTHLY_BUDGET_USD", "0");

    expect(() => getDefaultMonthlyBudgetUsd()).toThrow(/between/);
  });

  it("rejects a public key reused as the service-role key", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "same-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "same-key");
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter");
    vi.stubEnv("ALLOWED_MODEL_IDS", "model/a");
    vi.stubEnv("DEFAULT_MONTHLY_BUDGET_USD", "25");

    expect(validateProductionConfig().issues).toContain(
      "SUPABASE_SERVICE_ROLE_KEY must not equal the public Supabase key."
    );
  });
});
