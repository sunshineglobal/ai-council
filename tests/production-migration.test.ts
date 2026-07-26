import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/0005_production_guardrails.sql", import.meta.url),
  "utf8"
);

describe("production guardrail migration", () => {
  it("is atomic and keeps guardrail functions service-role only", () => {
    expect(migration.trimStart()).toMatch(/^--[\s\S]*?\nbegin;/i);
    expect(migration.trimEnd()).toMatch(/commit;$/i);
    expect(migration).toContain("revoke execute on function public.consume_rate_limit");
    expect(migration).toContain("grant execute on function public.consume_rate_limit");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("from anon, authenticated");
    expect(migration).toContain('drop policy if exists "council attachment objects insert"');
  });

  it("installs distributed rate, lease, budget, quota, and pruning primitives", () => {
    for (const primitive of [
      "consume_rate_limit",
      "acquire_operation_lease",
      "reserve_usage_budget",
      "attachment_storage_usage_bytes",
      "prune_production_guardrails"
    ]) {
      expect(migration).toContain(primitive);
    }
  });
});
