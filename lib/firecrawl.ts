import { getEnv } from "@/lib/env";
import type { ResearchResult, ResearchSource } from "@/lib/types";
import { estimateTokens } from "@/lib/token-usage";
import { TtlCache } from "@/lib/cache";

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
const RESEARCH_CONTEXT_CHARS_PER_SOURCE = 900;
const RESEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const researchCache = new TtlCache<string, ResearchResult>(RESEARCH_CACHE_TTL_MS, 64);

type FirecrawlSearchItem = {
  title?: string;
  url?: string;
  description?: string;
  markdown?: string;
  content?: string;
};

type FirecrawlSearchResponse = {
  data?: FirecrawlSearchItem[];
  creditsUsed?: number;
  credits_used?: number;
};

export async function searchWithFirecrawl(query: string, limit = 5): Promise<ResearchResult> {
  const cacheKey = `${limit}::${query.trim().toLowerCase()}`;
  const cacheEnabled = process.env.NODE_ENV !== "test";
  const cached = cacheEnabled ? researchCache.get(cacheKey) : undefined;
  if (cached) return cached;

  const response = await fetch(FIRECRAWL_SEARCH_URL, {
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
    const details = await response.text().catch(() => "");
    throw new Error(`Firecrawl search failed (${response.status}): ${details || response.statusText}`);
  }

  const body = (await response.json()) as FirecrawlSearchResponse;
  const credits = body.creditsUsed ?? body.credits_used ?? 0;
  const sources = (body.data ?? [])
    .filter((item) => item.url)
    .slice(0, limit)
    .map(normalizeSource);

  const context = buildResearchContext({ query, sources, credits, estimatedContextTokens: 0 });

  const result: ResearchResult = {
    query,
    sources,
    credits,
    estimatedContextTokens: estimateTokens(context)
  };
  if (cacheEnabled) {
    researchCache.set(cacheKey, result);
  }
  return result;
}

export function buildResearchContext(result?: ResearchResult): string {
  if (!result || result.sources.length === 0) return "";

  return [
    `Research query: ${result.query}`,
    ...result.sources.map((source, index) => {
      const excerpt = (source.markdown || source.snippet || source.description || "").slice(0, RESEARCH_CONTEXT_CHARS_PER_SOURCE);
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
