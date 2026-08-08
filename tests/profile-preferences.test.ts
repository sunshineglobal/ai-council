import { describe, expect, it } from "vitest";
import { chatTitleSchema, profilePreferencesSchema } from "@/lib/validation";

describe("profilePreferencesSchema", () => {
  it("accepts a boolean save-history preference", () => {
    expect(profilePreferencesSchema.parse({ defaultSaveHistory: true })).toEqual({
      defaultSaveHistory: true
    });
    expect(profilePreferencesSchema.parse({ defaultSaveHistory: false })).toEqual({
      defaultSaveHistory: false
    });
  });

  it("rejects non-boolean values", () => {
    expect(() => profilePreferencesSchema.parse({ defaultSaveHistory: "yes" })).toThrow();
  });
});

describe("chatTitleSchema", () => {
  it("trims and accepts titles up to 120 characters", () => {
    expect(chatTitleSchema.parse({ title: "  Decision memo  " })).toEqual({ title: "Decision memo" });
  });

  it("rejects blank titles", () => {
    expect(() => chatTitleSchema.parse({ title: "   " })).toThrow();
  });
});
