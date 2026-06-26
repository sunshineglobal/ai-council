import { getAppUrl, getEnv, getOptionalEnv } from "@/lib/env";
import type { ResearchResult, ResearchSource } from "@/lib/types";
import { estimateTokens } from "@/lib/token-usage";
import { TtlCache } from "@/lib/cache";

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_RESEARCH_MODEL = "openai/gpt-4o-mini";
const RESEARCH_CONTEXT_CHARS_PER_SOURCE = 900;
const RESEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const researchCache = new TtlCache<string, ResearchResult>(RESEARCH_CACHE_TTL_MS, 64);

type OpenRouterCitation = {
  title?: string;
  url?: string;
  content?: string;
  start_index?: number;
  end_index?: number;
};

type OpenRouterWebAnnotation = {
  type?: string;
  url_citation?: OpenRouterCitation;
};

type OpenRouterWebSearchResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
      annotations?: OpenRouterWebAnnotation[];
    };
  }>;
  error?: string | {
    message?: string;
    code?: string;
    type?: string;
  };
};

export async function searchWithFirecrawl(query: string, limit = 5): Promise<ResearchResult> {
  const cacheKey = `${limit}::${query.trim().toLowerCase()}`;
  const cacheEnabled = process.env.NODE_ENV !== "test";
  const cached = cacheEnabled ? researchCache.get(cacheKey) : undefined;
  if (cached) return cached;

  const model = getOptionalEnv("OPENROUTER_RESEARCH_MODEL") ?? DEFAULT_RESEARCH_MODEL;
  const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getEnv("OPENROUTER_API_KEY")}`,
      "Content-Type": "application/json",
      "HTTP-Referer": getAppUrl(),
      "X-Title": "Personal AI Council"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a web research assistant. Search the web, extract current facts, and return a concise source-grounded briefing."
        },
        {
          role: "user",
          content: `Research this prompt for an AI council. Focus on current, reliable sources and cite them.\n\n${query}`
        }
      ],
      temperature: 0.1,
      max_tokens: 900,
      plugins: [
        {
          id: "web",
          engine: "firecrawl",
          max_results: limit,
          search_prompt:
            "A Firecrawl web search was conducted through OpenRouter. Use the following web results as research context and cite relevant sources."
        }
      ]
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`OpenRouter Firecrawl web search failed (${response.status}): ${details || response.statusText}`);
  }

  const body = (await response.json()) as OpenRouterWebSearchResponse;
  if (body.error) {
    throw new Error(`OpenRouter Firecrawl web search failed: ${formatOpenRouterError(body.error)}`);
  }

  const message = body.choices?.[0]?.message;
  const summary = normalizeMessageContent(message?.content);
  const sources = extractCitationSources(message?.annotations, summary)
    .slice(0, limit)
    .map(normalizeSource);

  const context = buildResearchContext({ query, sources, credits: 0, estimatedContextTokens: 0 });

  const result: ResearchResult = {
    query,
    sources,
    credits: 0,
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

function normalizeSource(item: OpenRouterCitation): ResearchSource {
  const markdown = item.content ?? "";
  return {
    title: item.title || item.url || "Untitled source",
    url: item.url ?? "",
    description: markdown.slice(0, 240),
    markdown,
    snippet: markdown.slice(0, 500)
  };
}

function extractCitationSources(annotations: OpenRouterWebAnnotation[] | undefined, summary: string): OpenRouterCitation[] {
  const seen = new Set<string>();
  const sources: OpenRouterCitation[] = [];

  for (const annotation of annotations ?? []) {
    if (annotation.type !== "url_citation" || !annotation.url_citation?.url) continue;
    const citation = annotation.url_citation;
    const url = citation.url;
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    sources.push({
      ...citation,
      url,
      content: citation.content || excerptCitation(summary, citation)
    });
  }

  return sources;
}

function excerptCitation(summary: string, citation: OpenRouterCitation) {
  if (!summary || citation.start_index === undefined || citation.end_index === undefined) return "";
  return summary.slice(Math.max(0, citation.start_index), Math.max(citation.start_index, citation.end_index));
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text);
        }
        return "";
      })
      .join("");
  }
  return "";
}

function formatOpenRouterError(error: OpenRouterWebSearchResponse["error"]) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  return [error.message, error.code && `code ${error.code}`, error.type].filter(Boolean).join(" ") || "Unknown error";
}
