import { getEnv } from "@/lib/env";
import type { ResearchResult, ResearchSource } from "@/lib/types";
import { estimateTokens } from "@/lib/token-usage";
import { TtlCache } from "@/lib/cache";

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
export const MIN_DETAILED_RESEARCH_SOURCES = 15;
export const MAX_FIRECRAWL_SEARCH_LIMIT = 100;
export const DEFAULT_FIRECRAWL_LIMIT = MIN_DETAILED_RESEARCH_SOURCES;
const RESEARCH_CONTEXT_CHARS_PER_SOURCE = 900;
const RESEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const researchCache = new TtlCache<string, ResearchResult>(RESEARCH_CACHE_TTL_MS, 64);

type FirecrawlSearchItem = {
  title?: string;
  url?: string;
  description?: string;
  snippet?: string;
  markdown?: string;
  content?: string;
  metadata?: {
    title?: string;
    description?: string;
    sourceURL?: string;
    url?: string;
  };
};

type FirecrawlSearchData = {
  web?: FirecrawlSearchItem[];
  news?: FirecrawlSearchItem[];
};

type FirecrawlSearchResponse = {
  data?: FirecrawlSearchItem[] | FirecrawlSearchData;
  creditsUsed?: number;
  credits_used?: number;
};

export async function searchWithFirecrawl(
  query: string,
  limit = DEFAULT_FIRECRAWL_LIMIT,
  signal?: AbortSignal,
  cacheScope = "shared"
): Promise<ResearchResult> {
  const normalizedLimit = normalizeFirecrawlLimit(limit);
  const cacheKey = JSON.stringify([cacheScope, normalizedLimit, query.trim()]);
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
      limit: normalizedLimit,
      sources: ["web"],
      scrapeOptions: {
        formats: [{ type: "markdown" }],
        onlyMainContent: true
      }
    }),
    signal
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Firecrawl search failed (${response.status}): ${details || response.statusText}`);
  }

  const body = (await response.json()) as FirecrawlSearchResponse;
  const credits = body.creditsUsed ?? body.credits_used ?? 0;
  const sources = extractSearchItems(body.data)
    .filter(hasDetailedSource)
    .slice(0, normalizedLimit)
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

function normalizeFirecrawlLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_FIRECRAWL_LIMIT;
  const wholeLimit = Math.floor(limit);
  return Math.min(Math.max(wholeLimit, MIN_DETAILED_RESEARCH_SOURCES), MAX_FIRECRAWL_SEARCH_LIMIT);
}

function extractSearchItems(data: FirecrawlSearchResponse["data"]): FirecrawlSearchItem[] {
  if (Array.isArray(data)) return data;
  if (!data) return [];
  return [...(data.web ?? []), ...(data.news ?? [])];
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

function getSourceUrl(item: FirecrawlSearchItem): string {
  return item.url ?? item.metadata?.sourceURL ?? item.metadata?.url ?? "";
}

function getSourceDetail(item: FirecrawlSearchItem): string {
  return item.markdown ?? item.content ?? item.snippet ?? item.description ?? item.metadata?.description ?? "";
}

function hasDetailedSource(item: FirecrawlSearchItem): boolean {
  return Boolean(getSourceUrl(item) && getSourceDetail(item).trim());
}

function normalizeSource(item: FirecrawlSearchItem): ResearchSource {
  const url = getSourceUrl(item);
  const markdown = item.markdown ?? item.content ?? "";
  const description = item.description ?? item.snippet ?? item.metadata?.description ?? "";
  return {
    title: item.title || item.metadata?.title || url || "Untitled source",
    url,
    description,
    markdown,
    snippet: markdown.slice(0, 500) || description.slice(0, 500)
  };
}
