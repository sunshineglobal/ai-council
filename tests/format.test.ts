import { describe, expect, it } from "vitest";
import { formatCompactCurrency, formatCurrency, formatSignedCurrency } from "@/lib/format";

describe("currency formatting", () => {
  it("clamps non-positive amounts to zero for cost display", () => {
    expect(formatCurrency(0)).toBe("$0.000000");
    expect(formatCurrency(-1.5)).toBe("$0.000000");
    expect(formatCurrency(1.5)).toBe("$1.500000");
  });

  it("keeps the sign for remaining budget", () => {
    expect(formatSignedCurrency(-1.25)).toBe("-$1.250000");
    expect(formatSignedCurrency(2)).toBe("$2.000000");
  });

  it("formats compact currency for the workspace chip", () => {
    expect(formatCompactCurrency(12.4)).toBe("$12.40");
    expect(formatCompactCurrency(-0.2)).toBe("-$0.20");
  });
});
