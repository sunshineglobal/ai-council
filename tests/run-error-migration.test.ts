import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/0007_run_error_message.sql", import.meta.url),
  "utf8"
);

describe("run error message migration", () => {
  it("adds error_message to council_runs", () => {
    expect(migration).toMatch(/add column if not exists error_message text/i);
    expect(migration).toContain("council_runs");
  });
});
