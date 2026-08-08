import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/0006_completion_alignments.sql", import.meta.url),
  "utf8"
);

describe("completion alignment migration", () => {
  it("aligns attachment storage to the 4 MB app limit", () => {
    expect(migration).toContain("file_size_limit = 4000000");
    expect(migration).toContain("council-attachments");
  });

  it("removes the unused critique target column", () => {
    expect(migration).toMatch(/drop column if exists target_model_id/i);
  });
});
