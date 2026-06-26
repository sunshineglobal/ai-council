import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireApiProfile } from "@/lib/auth";
import { fetchOpenRouterModels } from "@/lib/openrouter";

const fallbackModels = [
  { id: "openai/gpt-4o-mini", name: "OpenAI GPT-4o mini" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
  { id: "google/gemini-flash-1.5", name: "Gemini Flash 1.5" },
  { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B Instruct" }
];

export async function GET() {
  try {
    await requireApiProfile();
    const models = await fetchOpenRouterModels();
    return NextResponse.json({ models: models.length ? models : fallbackModels });
  } catch (error) {
    if (error instanceof Error && error.message.includes("OpenRouter")) {
      return NextResponse.json({ models: fallbackModels, warning: error.message });
    }
    return jsonError(error);
  }
}
