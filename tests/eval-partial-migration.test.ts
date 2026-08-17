import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/0008_eval_partial_status.sql", import.meta.url),
  "utf8"
);

describe("eval partial status migration", () => {
  it("adds a partial value to run_status", () => {
    expect(migration).toMatch(/alter type public\.run_status add value if not exists 'partial'/i);
  });
});
