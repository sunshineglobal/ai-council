import { describe, expect, it } from "vitest";
import { buildResearchContext } from "@/lib/firecrawl";

describe("Firecrawl research context", () => {
  it("formats sources with stable citation numbers", () => {
    const context = buildResearchContext({
      query: "council routing",
      credits: 1,
      estimatedContextTokens: 0,
      sources: [
        {
          title: "Source A",
          url: "https://example.com/a",
          markdown: "Useful content",
          snippet: "Useful content"
        }
      ]
    });

    expect(context).toContain("Research query: council routing");
    expect(context).toContain("[1] Source A");
    expect(context).toContain("https://example.com/a");
  });
});
