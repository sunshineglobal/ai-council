import { getEnv } from "@/lib/env";
import type { ResearchResult, ResearchSource } from "@/lib/types";
import { estimateTokens } from "@/lib/token-usage";

type FirecrawlSearchItem = {
  title?: string;
  url?: string;
  description?: string;
  markdown?: string;
  content?: string;
};

export async function searchWithFirecrawl(query: string, limit = 5): Promise<ResearchResult> {
  const response = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getEnv("FIRECRAWL_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      limit,
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Firecrawl search failed: ${response.status}`);
  }

  const body = (await response.json()) as {
    data?: FirecrawlSearchItem[];
    creditsUsed?: number;
    credits_used?: number;
  };

  const sources = (body.data ?? [])
    .filter((item) => item.url)
    .slice(0, limit)
    .map(normalizeSource);

  const context = buildResearchContext({ query, sources, credits: body.creditsUsed ?? body.credits_used ?? 0, estimatedContextTokens: 0 });

  return {
    query,
    sources,
    credits: body.creditsUsed ?? body.credits_used ?? 0,
    estimatedContextTokens: estimateTokens(context)
  };
}

export function buildResearchContext(result?: ResearchResult): string {
  if (!result || result.sources.length === 0) return "";

  return [
    `Research query: ${result.query}`,
    ...result.sources.map((source, index) => {
      const excerpt = (source.markdown || source.snippet || source.description || "").slice(0, 1800);
      return `[${index + 1}] ${source.title}\nURL: ${source.url}\n${excerpt}`;
    })
  ].join("\n\n");
}

function normalizeSource(item: FirecrawlSearchItem): ResearchSource {
  const markdown = item.markdown ?? item.content ?? "";
  const description = item.description ?? "";
  return {
    title: item.title || item.url || "Untitled source",
    url: item.url ?? "",
    description,
    markdown,
    snippet: markdown.slice(0, 500) || description.slice(0, 500)
  };
}
