import { describe, expect, it } from "vitest";
import {
  currentMonthValue,
  formatRange,
  monthRange
} from "@/components/admin-usage-dashboard/date-utils";

describe("admin usage month formatting", () => {
  it("zero-pads months at both ends of the year", () => {
    expect(currentMonthValue(new Date(2025, 0, 15))).toBe("2025-01");
    expect(currentMonthValue(new Date(2025, 11, 15))).toBe("2025-12");
  });
});

describe("admin usage month ranges", () => {
  it("uses an exclusive next-month boundary across leap day", () => {
    expect(monthRange("2024-02")).toEqual({
      from: new Date(2024, 1, 1).toISOString(),
      to: new Date(2024, 2, 1).toISOString()
    });
  });

  it("rolls December into the following year", () => {
    expect(monthRange("2025-12")).toEqual({
      from: new Date(2025, 11, 1).toISOString(),
      to: new Date(2026, 0, 1).toISOString()
    });
  });

  it("falls back to the supplied current month for invalid input", () => {
    expect(monthRange("invalid", new Date(2026, 4, 20))).toEqual({
      from: new Date(2026, 4, 1).toISOString(),
      to: new Date(2026, 5, 1).toISOString()
    });
  });

  it("formats the inclusive final day from an exclusive range end", () => {
    const range = monthRange("2024-02");
    const startLabel = new Date(2024, 1, 1).toLocaleDateString([], { month: "short", day: "numeric" });
    const endLabel = new Date(2024, 1, 29).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric"
    });

    expect(formatRange(range.from, range.to)).toBe(`${startLabel} - ${endLabel}`);
  });
});
