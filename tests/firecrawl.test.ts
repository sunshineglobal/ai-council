import { afterEach, describe, expect, it, vi } from "vitest";
import { buildResearchContext, searchWithFirecrawl } from "@/lib/firecrawl";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_RESEARCH_MODEL;
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

  it("uses OpenRouter web search with the Firecrawl engine", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Recent world news summary.",
                annotations: [
                  {
                    type: "url_citation",
                    url_citation: {
                      title: "World News",
                      url: "https://example.com/news",
                      content: "Longer world news context.",
                      start_index: 0,
                      end_index: 12
                    }
                  }
                ]
              }
            }
          ]
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
    expect(result.credits).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining('"engine":"firecrawl"')
      })
    );
  });

  it("deduplicates OpenRouter web citations by URL", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Recent world news summary.",
                annotations: [
                  {
                    type: "url_citation",
                    url_citation: {
                      title: "World News",
                      url: "https://example.com/news",
                      content: "First excerpt."
                    }
                  },
                  {
                    type: "url_citation",
                    url_citation: {
                      title: "World News Duplicate",
                      url: "https://example.com/news",
                      content: "Duplicate excerpt."
                    }
                  },
                  {
                    type: "url_citation",
                    url_citation: {
                      title: "Market News",
                      url: "https://example.com/markets",
                      content: "Market excerpt."
                    }
                  }
                ]
              }
            }
          ]
        }),
        { status: 200 }
      )
    );

    const result = await searchWithFirecrawl("latest world news", 5);

    expect(result.sources.map((source) => source.url)).toEqual(["https://example.com/news", "https://example.com/markets"]);
  });

  it("retries transient OpenRouter Firecrawl HTTP failures once", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: "Internal Server Error",
              code: 500
            }
          }),
          { status: 500 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Recovered summary.",
                  annotations: [
                    {
                      type: "url_citation",
                      url_citation: {
                        title: "Recovered Source",
                        url: "https://example.com/recovered",
                        content: "Recovered context."
                      }
                    }
                  ]
                }
              }
            ]
          }),
          { status: 200 }
        )
      );

    const result = await searchWithFirecrawl("latest world news", 5);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.sources[0]).toMatchObject({
      title: "Recovered Source",
      url: "https://example.com/recovered"
    });
  });

  it("rejects OpenRouter web search errors clearly", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "Firecrawl plugin setup is required",
            code: "plugin_setup_required"
          }
        }),
        { status: 200 }
      )
    );

    await expect(searchWithFirecrawl("latest world news", 5)).rejects.toThrow(/Firecrawl plugin setup is required/);
  });
});
