import { afterEach, describe, expect, it, vi } from "vitest";
import { buildResearchContext, searchWithFirecrawl } from "@/lib/firecrawl";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.FIRECRAWL_API_KEY;
});

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

  it("uses the standalone Firecrawl search API", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              title: "World News",
              url: "https://example.com/news",
              description: "Recent world news summary.",
              markdown: "Longer world news context."
            },
            {
              title: "Missing URL",
              markdown: "Ignored because Firecrawl did not return a URL."
            }
          ],
          creditsUsed: 1.5
        }),
        { status: 200 }
      )
    );

    const result = await searchWithFirecrawl("latest world news", 5);

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      title: "World News",
      url: "https://example.com/news",
      snippet: "Longer world news context."
    });
    expect(result.credits).toBe(1.5);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.firecrawl.dev/v2/search");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(init.body as string)).toEqual({
      query: "latest world news",
      limit: 5,
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true
      }
    });
  });

  it("normalizes Firecrawl content fallbacks and snake_case credits", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              url: "https://example.com/content",
              content: "Content fallback."
            },
            {
              url: "https://example.com/description",
              description: "Description fallback."
            }
          ],
          credits_used: 2
        }),
        { status: 200 }
      )
    );

    const result = await searchWithFirecrawl("latest world news", 5);

    expect(result.credits).toBe(2);
    expect(result.sources[0]).toMatchObject({
      title: "https://example.com/content",
      markdown: "Content fallback.",
      snippet: "Content fallback."
    });
    expect(result.sources[1]).toMatchObject({
      title: "https://example.com/description",
      description: "Description fallback.",
      snippet: "Description fallback."
    });
  });

  it("rejects Firecrawl HTTP errors clearly", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" })
    );

    await expect(searchWithFirecrawl("latest world news", 5)).rejects.toThrow(
      /Firecrawl search failed \(500\): Internal Server Error/
    );
  });
});
