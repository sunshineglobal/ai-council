import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../supabase/migrations/0004_security_and_integrity.sql", import.meta.url);

describe("security and integrity migration", () => {
  it("restricts authenticated profile updates to safe preference columns", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/revoke update on table public\.profiles from anon, authenticated/i);
    expect(sql).toMatch(/grant update \(default_save_history\) on table public\.profiles to authenticated/i);
  });

  it("enforces tenant ownership in parent-child relationships", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("foreign key (thread_id, user_id)");
    expect(sql).toContain("foreign key (run_id, user_id)");
    expect(sql).toContain("foreign key (file_id, user_id)");
    expect(sql).toContain("foreign key (eval_set_id, user_id)");
  });
});
