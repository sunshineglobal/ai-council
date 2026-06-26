import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { buildAttachmentContext, cleanupEphemeralAttachments, loadUserAttachments, persistRunAttachments } from "@/lib/attachments";
import { getErrorLog, getErrorMessage } from "@/lib/errors";
import { compactText } from "@/lib/format";
import { buildResearchContext, searchWithFirecrawl } from "@/lib/firecrawl";
import { completeWithOpenRouter, fetchOpenRouterModels, type CompletionResult } from "@/lib/openrouter";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { emptyUsage, summarizeUsage } from "@/lib/token-usage";
import { buildUsageEvent, persistUsageEvent, pricingMapFromModels, type ModelPricingMap } from "@/lib/usage";
import type {
  CouncilAttachment,
  CouncilEvent,
  CouncilRunInput,
  CouncilRunResult,
  CouncilStage,
  CritiqueResult,
  JudgeRanking,
  JudgeResult,
  ResearchResult,
  StageResult,
  UsageEvent
} from "@/lib/types";

const MAX_MODELS = 8;
const DEFAULT_FIRECRAWL_LIMIT = 5;

type RunContext = {
  userId: string;
  userEmail: string;
  onEvent?: (event: CouncilEvent) => void | Promise<void>;
};

export async function runCouncil(input: CouncilRunInput, context: RunContext): Promise<CouncilRunResult> {
  validateInput(input);

  const admin = createSupabaseAdminClient();
  const runId = crypto.randomUUID();
  const started = Date.now();
  const usageEvents: UsageEvent[] = [];
  const pricingByModel = await loadPricingByModel();
  const attachments = await loadUserAttachments(admin, context.userId, input.attachmentIds ?? []);
  const attachmentContext = buildAttachmentContext(attachments);
  let threadId = input.saveHistory ? input.threadId : undefined;

  if (input.saveHistory && !threadId) {
    const { data, error } = await admin
      .from("chat_threads")
      .insert({
        user_id: context.userId,
        title: compactText(input.prompt, 72),
        is_ephemeral: false
      })
      .select("id")
      .single();
    assertSupabaseOk("creating chat thread", error);
    if (!data?.id) {
      throw new Error("Supabase data write failed while creating chat thread: no id was returned.");
    }
    threadId = data.id as string;
  }

  await insertRun(admin, {
    id: runId,
    threadId,
    userId: context.userId,
    input
  });

  if (input.saveHistory) {
    await persistRunAttachments({
      admin,
      runId,
      userId: context.userId,
      attachments
    });
  }

  await emit(context, { type: "started", runId });
  if (attachments.length) {
    await emit(context, {
      type: "stage",
      stage: "initial_answer",
      message: `Loaded ${attachments.length} attached ${attachments.length === 1 ? "file" : "files"}.`
    });
  }

  try {
    const research = input.researchEnabled
      ? await runResearchStage(input.prompt, input.saveHistory, runId, context, usageEvents)
      : undefined;

    const researchContext = buildResearchContext(research);
    const initialResponses = await runInitialStage(input, researchContext, attachmentContext, context, runId, usageEvents, pricingByModel);

    if (!initialResponses.some((result) => result.status === "complete" && result.content.trim())) {
      const reasons = initialResponses.map((result) => `${result.modelId}: ${result.error ?? "empty response"}`).join("; ");
      throw new Error(`Every council model failed during the initial answer stage. ${reasons}`);
    }

    const critiqueRounds: CritiqueResult[][] = [];
    for (let roundIndex = 1; roundIndex <= input.debateDepth; roundIndex += 1) {
      const { error } = await admin.from("debate_rounds").insert({ run_id: runId, round_index: roundIndex });
      assertSupabaseOk(`creating debate round ${roundIndex}`, error);
      const round = await runCritiqueRound({
        input,
        researchContext,
        attachmentContext,
        initialResponses,
        previousRounds: critiqueRounds,
        roundIndex,
        context,
        runId,
        usageEvents,
        pricingByModel
      });
      critiqueRounds.push(round);
    }

    const revisions = await runRevisionStage({
      input,
      researchContext,
      attachmentContext,
      initialResponses,
      critiqueRounds,
      context,
      runId,
      usageEvents,
      pricingByModel
    });

    const judge = await runJudgeStage({
      input,
      research,
      attachmentContext,
      initialResponses,
      critiqueRounds,
      revisions,
      context,
      runId,
      usageEvents,
      pricingByModel
    });

    const latencyMs = Date.now() - started;
    const tokenTotals = summarizeUsage(usageEvents);
    const costEstimate = usageEvents.reduce((sum, event) => sum + event.estimatedCost, 0);
    const result: CouncilRunResult = {
      id: runId,
      threadId,
      prompt: input.saveHistory ? input.prompt : undefined,
      finalAnswer: judge.synthesis,
      models: input.models,
      judgeModel: input.judgeModel,
      debateDepth: input.debateDepth,
      researchEnabled: input.researchEnabled,
      savedMode: input.saveHistory,
      attachments: attachments.map(redactAttachmentText),
      research,
      initialResponses,
      critiqueRounds,
      revisions,
      judge,
      usageEvents,
      tokenTotals,
      costEstimate,
      latencyMs,
      createdAt: new Date().toISOString()
    };

    const { error: updateError } = await admin
      .from("council_runs")
      .update({
        final_answer: input.saveHistory ? judge.synthesis : null,
        status: "complete",
        token_totals: tokenTotals,
        cost_estimate: costEstimate,
        latency_ms: latencyMs,
        updated_at: new Date().toISOString()
      })
      .eq("id", runId);
    assertSupabaseOk("marking council run complete", updateError);

    if (threadId) {
      const { error } = await admin.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
      assertSupabaseOk("updating chat thread timestamp", error);
    }

    await emit(context, { type: "complete", result });
    return result;
  } catch (error) {
    const message = getErrorMessage(error, "Council run failed.");
    console.error("[council] run failed", {
      runId,
      userId: context.userId,
      ...getErrorLog(error)
    });
    const { error: updateError } = await admin
      .from("council_runs")
      .update({
        status: "failed",
        latency_ms: Date.now() - started,
        updated_at: new Date().toISOString()
      })
      .eq("id", runId);
    if (updateError) {
      console.error("[council] could not mark run failed", {
        runId,
        userId: context.userId,
        ...getErrorLog(updateError)
      });
    }
    await emit(context, { type: "error", message });
    throw error;
  } finally {
    if (!input.saveHistory && attachments.length) {
      await cleanupEphemeralAttachments({
        admin,
        userId: context.userId,
        attachmentIds: attachments.map((attachment) => attachment.id)
      });
    }
  }
}

function validateInput(input: CouncilRunInput) {
  if (!input.prompt.trim()) throw new Error("Prompt is required.");
  if (input.models.length < 1) throw new Error("Choose at least one council model.");
  if (input.models.length > MAX_MODELS) throw new Error(`Choose at most ${MAX_MODELS} council models.`);
  if (new Set(input.models).size !== input.models.length) throw new Error("Council models must be unique.");
  if ((input.attachmentIds ?? []).length !== new Set(input.attachmentIds ?? []).size) throw new Error("Attached files must be unique.");
  if (!input.judgeModel.trim()) throw new Error("Judge model is required.");
  if (input.debateDepth < 1 || input.debateDepth > 4) throw new Error("Debate depth must be between 1 and 4.");
}

async function insertRun(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  params: {
    id: string;
    threadId?: string;
    userId: string;
    input: CouncilRunInput;
  }
) {
  const { error } = await admin.from("council_runs").insert({
    id: params.id,
    thread_id: params.threadId ?? null,
    user_id: params.userId,
    prompt_text: params.input.saveHistory ? params.input.prompt : null,
    final_answer: null,
    judge_model: params.input.judgeModel,
    models: params.input.models,
    debate_depth: params.input.debateDepth,
    research_enabled: params.input.researchEnabled,
    saved_mode: params.input.saveHistory,
    status: "running"
  });
  assertSupabaseOk("creating council run", error);
}

async function runResearchStage(
  prompt: string,
  saveHistory: boolean,
  runId: string,
  context: RunContext,
  usageEvents: UsageEvent[]
): Promise<ResearchResult> {
  await emit(context, { type: "stage", stage: "research_context", message: "Searching the web with Firecrawl." });
  const research = await searchWithFirecrawl(prompt, DEFAULT_FIRECRAWL_LIMIT);
  const usage = buildUsageEvent({
    stage: "research_context",
    modelId: "firecrawl",
    usage: {
      promptTokens: research.estimatedContextTokens,
      completionTokens: 0,
      totalTokens: research.estimatedContextTokens,
      estimated: true
    },
    latencyMs: 0,
    status: "estimated"
  });
  usageEvents.push(usage);
  await persistRunUsage(runId, context.userId, usage);

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("research_results").insert({
    run_id: runId,
    user_id: context.userId,
    query: saveHistory ? research.query : null,
    results: saveHistory ? research.sources : null,
    result_count: research.sources.length,
    firecrawl_credits: research.credits,
    saved_mode: saveHistory
  });
  assertSupabaseOk("saving research results", error);

  await emit(context, { type: "research", research });
  await emit(context, { type: "usage", usage });
  return research;
}

async function runInitialStage(
  input: CouncilRunInput,
  researchContext: string,
  attachmentContext: string,
  context: RunContext,
  runId: string,
  usageEvents: UsageEvent[],
  pricingByModel: ModelPricingMap
): Promise<StageResult[]> {
  await emit(context, { type: "stage", stage: "initial_answer", message: "Collecting initial answers." });

  return Promise.all(
    input.models.map((modelId) =>
      callModelStage({
        modelId,
        stage: "initial_answer",
        messages: buildInitialMessages(input.prompt, researchContext, attachmentContext),
        saveHistory: input.saveHistory,
        runId,
        userId: context.userId,
        usageEvents,
        pricingByModel,
        context
      })
    )
  );
}

async function runCritiqueRound(params: {
  input: CouncilRunInput;
  researchContext: string;
  attachmentContext: string;
  initialResponses: StageResult[];
  previousRounds: CritiqueResult[][];
  roundIndex: number;
  context: RunContext;
  runId: string;
  usageEvents: UsageEvent[];
  pricingByModel: ModelPricingMap;
}): Promise<CritiqueResult[]> {
  await emit(params.context, {
    type: "stage",
    stage: "debate_critique",
    message: `Running debate round ${params.roundIndex}.`
  });

  return Promise.all(
    params.input.models.map((modelId) =>
      callCritiqueStage({
        modelId,
        messages: buildCritiqueMessages({
          modelId,
          prompt: params.input.prompt,
          researchContext: params.researchContext,
          attachmentContext: params.attachmentContext,
          initialResponses: params.initialResponses,
          previousRounds: params.previousRounds,
          roundIndex: params.roundIndex
        }),
        saveHistory: params.input.saveHistory,
        roundIndex: params.roundIndex,
        runId: params.runId,
        userId: params.context.userId,
        usageEvents: params.usageEvents,
        pricingByModel: params.pricingByModel,
        context: params.context
      })
    )
  );
}

async function runRevisionStage(params: {
  input: CouncilRunInput;
  researchContext: string;
  attachmentContext: string;
  initialResponses: StageResult[];
  critiqueRounds: CritiqueResult[][];
  context: RunContext;
  runId: string;
  usageEvents: UsageEvent[];
  pricingByModel: ModelPricingMap;
}): Promise<StageResult[]> {
  await emit(params.context, { type: "stage", stage: "revision", message: "Asking models to revise their answers." });

  return Promise.all(
    params.input.models.map((modelId) =>
      callModelStage({
        modelId,
        stage: "revision",
        messages: buildRevisionMessages({
          modelId,
          prompt: params.input.prompt,
          researchContext: params.researchContext,
          attachmentContext: params.attachmentContext,
          initialResponses: params.initialResponses,
          critiqueRounds: params.critiqueRounds
        }),
        saveHistory: params.input.saveHistory,
        runId: params.runId,
        userId: params.context.userId,
        usageEvents: params.usageEvents,
        pricingByModel: params.pricingByModel,
        context: params.context
      })
    )
  );
}

async function runJudgeStage(params: {
  input: CouncilRunInput;
  research?: ResearchResult;
  attachmentContext: string;
  initialResponses: StageResult[];
  critiqueRounds: CritiqueResult[][];
  revisions: StageResult[];
  context: RunContext;
  runId: string;
  usageEvents: UsageEvent[];
  pricingByModel: ModelPricingMap;
}): Promise<JudgeResult> {
  await emit(params.context, {
    type: "stage",
    stage: "judge_synthesis",
    modelId: params.input.judgeModel,
    message: "Ranking the council and writing the final answer."
  });

  const id = crypto.randomUUID();
  const promptText = buildJudgePrompt(params);
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You are a rigorous judge for a private AI model council. Return valid JSON only, with fair rankings and a final answer that is better than any individual response."
    },
    { role: "user", content: promptText }
  ];

  let completion: CompletionResult;
  try {
    try {
      completion = await completeWithOpenRouter({
        model: params.input.judgeModel,
        messages,
        temperature: 0.2,
        maxTokens: 2200,
        responseFormat: "json_object"
      });
    } catch (error) {
      console.warn("[council] judge JSON mode failed, retrying without response_format", {
        runId: params.runId,
        modelId: params.input.judgeModel,
        ...getErrorLog(error)
      });
      completion = await completeWithOpenRouter({
        model: params.input.judgeModel,
        messages,
        temperature: 0.2,
        maxTokens: 2200
      });
    }

  } catch (error) {
    const message = getErrorMessage(error, "Judge failed.");
    const failedResult: JudgeResult = {
      id,
      modelId: params.input.judgeModel,
      synthesis: "The judge model failed before it could synthesize a final answer.",
      rankings: [],
      usage: emptyUsage(),
      latencyMs: 0,
      status: "error",
      error: message
    };
    await persistJudge(params.runId, params.input.saveHistory, failedResult);
    return failedResult;
  }

  const parsed = parseJudgeOutput(completion.content);
  const synthesis = parsed.synthesis || completion.content;
  const result: JudgeResult = {
    id,
    modelId: params.input.judgeModel,
    synthesis,
    rankings: parsed.rankings,
    usage: completion.usage,
    latencyMs: completion.latencyMs,
    status: "complete"
  };

  await persistJudge(params.runId, params.input.saveHistory, result);
  await recordUsage({
    runId: params.runId,
    userId: params.context.userId,
    stage: "judge_synthesis",
    modelId: params.input.judgeModel,
    completion,
    pricingByModel: params.pricingByModel,
    usageEvents: params.usageEvents,
    context: params.context
  });

  return result;
}

async function callModelStage(params: {
  modelId: string;
  stage: "initial_answer" | "revision";
  messages: ChatCompletionMessageParam[];
  saveHistory: boolean;
  runId: string;
  userId: string;
  usageEvents: UsageEvent[];
  pricingByModel: ModelPricingMap;
  context: RunContext;
}): Promise<StageResult> {
  const id = crypto.randomUUID();
  let completion: CompletionResult;
  try {
    completion = await completeWithOpenRouter({
      model: params.modelId,
      messages: params.messages,
      temperature: params.stage === "initial_answer" ? 0.55 : 0.35,
      maxTokens: 1800
    });
  } catch (error) {
    const message = getErrorMessage(error, "Model call failed.");
    const result: StageResult = {
      id,
      modelId: params.modelId,
      stage: params.stage,
      content: "",
      usage: emptyUsage(),
      latencyMs: 0,
      status: "error",
      error: message
    };
    await persistModelResponse(params.runId, params.saveHistory, result);
    return result;
  }

  const result: StageResult = {
    id,
    modelId: params.modelId,
    stage: params.stage,
    content: completion.content,
    usage: completion.usage,
    latencyMs: completion.latencyMs,
    status: "complete"
  };
  await persistModelResponse(params.runId, params.saveHistory, result);
  await recordUsage({
    runId: params.runId,
    userId: params.userId,
    stage: params.stage,
    modelId: params.modelId,
    completion,
    pricingByModel: params.pricingByModel,
    usageEvents: params.usageEvents,
    context: params.context
  });
  return result;
}

async function callCritiqueStage(params: {
  modelId: string;
  messages: ChatCompletionMessageParam[];
  saveHistory: boolean;
  roundIndex: number;
  runId: string;
  userId: string;
  usageEvents: UsageEvent[];
  pricingByModel: ModelPricingMap;
  context: RunContext;
}): Promise<CritiqueResult> {
  const id = crypto.randomUUID();
  let completion: CompletionResult;
  try {
    completion = await completeWithOpenRouter({
      model: params.modelId,
      messages: params.messages,
      temperature: 0.45,
      maxTokens: 1400
    });
  } catch (error) {
    const message = getErrorMessage(error, "Critique call failed.");
    const result: CritiqueResult = {
      id,
      roundIndex: params.roundIndex,
      modelId: params.modelId,
      content: "",
      usage: emptyUsage(),
      latencyMs: 0,
      status: "error",
      error: message
    };
    await persistCritique(params.runId, params.saveHistory, result);
    return result;
  }

  const result: CritiqueResult = {
    id,
    roundIndex: params.roundIndex,
    modelId: params.modelId,
    content: completion.content,
    usage: completion.usage,
    latencyMs: completion.latencyMs,
    status: "complete"
  };
  await persistCritique(params.runId, params.saveHistory, result);
  await recordUsage({
    runId: params.runId,
    userId: params.userId,
    stage: "debate_critique",
    modelId: params.modelId,
    completion,
    pricingByModel: params.pricingByModel,
    usageEvents: params.usageEvents,
    context: params.context
  });
  return result;
}

function buildInitialMessages(prompt: string, researchContext: string, attachmentContext: string): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content:
        "You are one member of a private AI council. Produce an independent, high-quality answer. Use the supplied research context when relevant and cite sources as [1], [2], etc."
    },
    {
      role: "user",
      content: [
        researchContext && `Shared research context:\n${researchContext}`,
        attachmentContext && `Attached file context:\n${attachmentContext}`,
        `User prompt:\n${prompt}`
      ]
        .filter(Boolean)
        .join("\n\n")
    }
  ];
}

function buildCritiqueMessages(params: {
  modelId: string;
  prompt: string;
  researchContext: string;
  attachmentContext: string;
  initialResponses: StageResult[];
  previousRounds: CritiqueResult[][];
  roundIndex: number;
}): ChatCompletionMessageParam[] {
  const peerResponses = params.initialResponses
    .map((response) => `${response.modelId}${response.modelId === params.modelId ? " (you)" : ""}:\n${response.content || response.error}`)
    .join("\n\n");
  const previous = params.previousRounds
    .flat()
    .map((critique) => `Round ${critique.roundIndex} - ${critique.modelId}:\n${critique.content || critique.error}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content:
        "You are debating as one council member. Critique the other answers, name concrete weaknesses, keep what is strong, and propose improvements. Be concise and evidence-driven."
    },
    {
      role: "user",
      content: [
        `Original prompt:\n${params.prompt}`,
        params.researchContext && `Research context:\n${params.researchContext}`,
        params.attachmentContext && `Attached file context:\n${params.attachmentContext}`,
        `Initial council answers:\n${peerResponses}`,
        previous && `Previous debate rounds:\n${previous}`,
        `This is debate round ${params.roundIndex}. Respond as ${params.modelId}.`
      ]
        .filter(Boolean)
        .join("\n\n")
    }
  ];
}

function buildRevisionMessages(params: {
  modelId: string;
  prompt: string;
  researchContext: string;
  attachmentContext: string;
  initialResponses: StageResult[];
  critiqueRounds: CritiqueResult[][];
}): ChatCompletionMessageParam[] {
  const ownInitial = params.initialResponses.find((response) => response.modelId === params.modelId)?.content ?? "";
  const critiques = params.critiqueRounds
    .flat()
    .map((critique) => `Round ${critique.roundIndex} - ${critique.modelId}:\n${critique.content || critique.error}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content:
        "You are revising your answer after a model-council debate. Preserve correct details, fix weaknesses, and produce your strongest final answer."
    },
    {
      role: "user",
      content: [
        `Original prompt:\n${params.prompt}`,
        params.researchContext && `Research context:\n${params.researchContext}`,
        params.attachmentContext && `Attached file context:\n${params.attachmentContext}`,
        `Your initial answer:\n${ownInitial}`,
        `Council critiques:\n${critiques}`,
        "Write your revised answer now."
      ]
        .filter(Boolean)
        .join("\n\n")
    }
  ];
}

function buildJudgePrompt(params: {
  input: CouncilRunInput;
  research?: ResearchResult;
  attachmentContext: string;
  initialResponses: StageResult[];
  critiqueRounds: CritiqueResult[][];
  revisions: StageResult[];
}) {
  const sourceList =
    params.research?.sources
      .map((source, index) => `[${index + 1}] ${source.title} - ${source.url}`)
      .join("\n") ?? "";
  const initial = params.initialResponses
    .map((response) => `${response.modelId}:\n${response.content || response.error}`)
    .join("\n\n");
  const debate = params.critiqueRounds
    .flat()
    .map((critique) => `Round ${critique.roundIndex} - ${critique.modelId}:\n${critique.content || critique.error}`)
    .join("\n\n");
  const revisions = params.revisions
    .map((response) => `${response.modelId}:\n${response.content || response.error}`)
    .join("\n\n");

  return `Prompt:
${params.input.prompt}

Sources:
${sourceList || "No web research was used."}

Attached files:
${params.attachmentContext || "No files were attached."}

Initial answers:
${initial}

Debate:
${debate}

Revised answers:
${revisions}

Return JSON with this shape:
{
  "final_answer": "the best final response",
  "consensus": "what the council agrees on",
  "disagreements": ["important disagreements"],
  "blind_spots": ["remaining uncertainty"],
  "rankings": [
    { "model_id": "model id", "rank": 1, "score": 95, "rationale": "why" }
  ]
}`;
}

function parseJudgeOutput(content: string): { synthesis: string; rankings: JudgeRanking[] } {
  try {
    const parsed = JSON.parse(content) as {
      final_answer?: string;
      consensus?: string;
      disagreements?: string[];
      blind_spots?: string[];
      rankings?: Array<{ model_id?: string; modelId?: string; rank?: number; score?: number; rationale?: string }>;
    };

    const sections = [
      parsed.final_answer,
      parsed.consensus && `Consensus\n${parsed.consensus}`,
      parsed.disagreements?.length && `Disagreements\n${parsed.disagreements.map((item) => `- ${item}`).join("\n")}`,
      parsed.blind_spots?.length && `Blind spots\n${parsed.blind_spots.map((item) => `- ${item}`).join("\n")}`
    ].filter(Boolean);

    return {
      synthesis: sections.join("\n\n"),
      rankings: (parsed.rankings ?? []).map((ranking, index) => ({
        modelId: ranking.model_id ?? ranking.modelId ?? "unknown",
        rank: ranking.rank ?? index + 1,
        score: ranking.score ?? 0,
        rationale: ranking.rationale ?? ""
      }))
    };
  } catch {
    return { synthesis: content, rankings: [] };
  }
}

async function persistModelResponse(runId: string, saveHistory: boolean, result: StageResult) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("model_responses").insert({
    id: result.id,
    run_id: runId,
    model_id: result.modelId,
    stage: result.stage,
    content: saveHistory ? result.content : null,
    token_usage: result.usage,
    latency_ms: result.latencyMs,
    status: result.status,
    error: result.error ?? null
  });
  assertSupabaseOk("saving model response", error);
}

async function persistCritique(runId: string, saveHistory: boolean, result: CritiqueResult) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("model_critiques").insert({
    id: result.id,
    run_id: runId,
    round_index: result.roundIndex,
    model_id: result.modelId,
    content: saveHistory ? result.content : null,
    token_usage: result.usage,
    latency_ms: result.latencyMs,
    status: result.status,
    error: result.error ?? null
  });
  assertSupabaseOk("saving model critique", error);
}

async function persistJudge(runId: string, saveHistory: boolean, result: JudgeResult) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("judge_rankings").insert({
    id: result.id,
    run_id: runId,
    judge_model: result.modelId,
    rankings: result.rankings,
    synthesis: saveHistory ? result.synthesis : null,
    token_usage: result.usage,
    latency_ms: result.latencyMs,
    status: result.status,
    error: result.error ?? null
  });
  assertSupabaseOk("saving judge result", error);
}

async function recordUsage(params: {
  runId: string;
  userId: string;
  stage: CouncilStage;
  modelId: string;
  completion: CompletionResult;
  pricingByModel: ModelPricingMap;
  usageEvents: UsageEvent[];
  context: RunContext;
}) {
  const usage = buildUsageEvent({
    stage: params.stage,
    modelId: params.modelId,
    usage: params.completion.usage,
    latencyMs: params.completion.latencyMs,
    pricing: params.pricingByModel[params.modelId]
  });
  params.usageEvents.push(usage);
  await persistRunUsage(params.runId, params.userId, usage);
  await emit(params.context, { type: "usage", usage });
}

async function persistRunUsage(runId: string, userId: string, usage: UsageEvent) {
  try {
    await persistUsageEvent({ runId, userId, usage });
  } catch (error) {
    assertSupabaseOk("saving token usage", error);
  }
}

async function loadPricingByModel(): Promise<ModelPricingMap> {
  try {
    return pricingMapFromModels(await fetchOpenRouterModels());
  } catch (error) {
    console.warn("[council] could not load model pricing for cost estimates", getErrorLog(error));
    return {};
  }
}

async function emit(context: RunContext, event: CouncilEvent) {
  await context.onEvent?.(event);
}

function redactAttachmentText(attachment: CouncilAttachment): CouncilAttachment {
  const { extractedText: _extractedText, ...safeAttachment } = attachment;
  return safeAttachment;
}

function assertSupabaseOk(action: string, error: unknown) {
  if (!error) return;
  throw new Error(`Supabase data write failed while ${action}: ${getErrorMessage(error)}`);
}
