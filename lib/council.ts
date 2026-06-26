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
import { TtlCache } from "@/lib/cache";

const MAX_MODELS = 8;
const DEFAULT_FIRECRAWL_LIMIT = 5;
const PEER_ANSWER_CONTEXT_CHARS = 3200;
const CRITIQUE_ROUND_CONTEXT_CHARS = 2400;

const researchCache = new TtlCache<string, ResearchResult>(10 * 60 * 1000, 64);
const answerCache = new TtlCache<string, StageResult>(15 * 60 * 1000, 128);
const critiqueCache = new TtlCache<string, CritiqueResult>(15 * 60 * 1000, 192);
const revisionCache = new TtlCache<string, StageResult>(15 * 60 * 1000, 128);
const judgeCache = new TtlCache<string, JudgeResult>(15 * 60 * 1000, 64);

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function makeAnswerCacheKey(modelId: string, prompt: string, researchContext: string, attachmentContext: string): string {
  return `${modelId}:${simpleHash(prompt)}:${simpleHash(researchContext)}:${simpleHash(attachmentContext)}`;
}

function makeMessagesCacheKey(stage: CouncilStage, modelId: string, messages: ChatCompletionMessageParam[]): string {
  const cacheText = messages.map((message) => `${message.role}:${normalizePromptContent(message.content)}`).join("\n\n---\n\n");
  return `${stage}:${modelId}:${simpleHash(cacheText)}`;
}

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
): Promise<ResearchResult | undefined> {
  await emit(context, { type: "stage", stage: "research_context", message: "Searching the web with Firecrawl." });

  const cacheKey = prompt.trim().toLowerCase().slice(0, 500);
  const cached = researchCache.get(cacheKey);
  if (cached) {
    await emit(context, { type: "stage", stage: "research_context", message: "Using cached research results." });
    const usage = buildUsageEvent({
      stage: "research_context",
      modelId: "firecrawl",
      usage: {
        promptTokens: cached.estimatedContextTokens,
        completionTokens: 0,
        totalTokens: cached.estimatedContextTokens,
        estimated: true
      },
      latencyMs: 0,
      status: "estimated"
    });
    usageEvents.push(usage);
    await persistRunUsage(runId, context.userId, usage);
    await persistResearchResult(runId, context.userId, saveHistory, cached);
    await emit(context, { type: "research", research: cached });
    await emit(context, { type: "usage", usage });
    return cached;
  }

  let research: ResearchResult;
  try {
    research = await searchWithFirecrawl(prompt, DEFAULT_FIRECRAWL_LIMIT);
  } catch (error) {
    const message = getErrorMessage(error, "Firecrawl research failed.");
    console.warn("[council] Firecrawl research failed; continuing without web context", {
      runId,
      userId: context.userId,
      ...getErrorLog(error)
    });
    const usage = buildUsageEvent({
      stage: "research_context",
      modelId: "firecrawl",
      usage: { ...emptyUsage(), estimated: true },
      latencyMs: 0,
      status: "error"
    });
    usageEvents.push(usage);
    await persistRunUsage(runId, context.userId, usage);
    await emit(context, {
      type: "stage",
      stage: "research_context",
      message: `Firecrawl research failed; continuing without web context. ${compactText(message, 180)}`
    });
    await emit(context, { type: "usage", usage });
    return undefined;
  }
  researchCache.set(cacheKey, research);

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
  await persistResearchResult(runId, context.userId, saveHistory, research);

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
    input.models.map(async (modelId) => {
      const cacheKey = makeAnswerCacheKey(modelId, input.prompt, researchContext, attachmentContext);
      const cached = answerCache.get(cacheKey);
      if (cached) {
        await emit(context, {
          type: "stage",
          stage: "initial_answer",
          message: `Using cached initial answer for ${modelId}.`
        });
        const usage = buildUsageEvent({
          stage: "initial_answer",
          modelId,
          usage: { ...emptyUsage(), estimated: true },
          latencyMs: 0,
          status: "estimated",
          pricing: pricingByModel[modelId]
        });
        usageEvents.push(usage);
        await persistRunUsage(runId, context.userId, usage);
        await emit(context, { type: "usage", usage });

        const runSpecificResult = {
          ...cached,
          id: crypto.randomUUID(),
          usage: emptyUsage(),
          latencyMs: 0
        };
        await persistModelResponse(runId, input.saveHistory, runSpecificResult);
        await emit(context, { type: "model_response", response: runSpecificResult });
        return runSpecificResult;
      }

      const result = await callModelStage({
        modelId,
        stage: "initial_answer",
        messages: buildInitialMessages(input.prompt, researchContext, attachmentContext),
        saveHistory: input.saveHistory,
        runId,
        userId: context.userId,
        usageEvents,
        pricingByModel,
        context
      });

      if (result.status === "complete") {
        answerCache.set(cacheKey, result);
      }
      return result;
    })
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
    params.input.models.map(async (modelId) => {
      const messages = buildCritiqueMessages({
        modelId,
        prompt: params.input.prompt,
        researchContext: params.researchContext,
        attachmentContext: params.attachmentContext,
        initialResponses: params.initialResponses,
        previousRounds: params.previousRounds,
        roundIndex: params.roundIndex
      });
      const cacheKey = makeMessagesCacheKey("debate_critique", modelId, messages);
      const cached = critiqueCache.get(cacheKey);
      if (cached) {
        await emit(params.context, {
          type: "stage",
          stage: "debate_critique",
          message: `Using cached debate critique for ${modelId}.`
        });
        const usage = await recordCachedUsage({
          runId: params.runId,
          userId: params.context.userId,
          stage: "debate_critique",
          modelId,
          usageEvents: params.usageEvents
        });
        const result: CritiqueResult = {
          ...cached,
          id: crypto.randomUUID(),
          usage: emptyUsage(),
          latencyMs: 0
        };
        await persistCritique(params.runId, params.input.saveHistory, result);
        await emit(params.context, { type: "critique", critique: result });
        await emit(params.context, { type: "usage", usage });
        return result;
      }

      const result = await callCritiqueStage({
        modelId,
        messages,
        saveHistory: params.input.saveHistory,
        roundIndex: params.roundIndex,
        runId: params.runId,
        userId: params.context.userId,
        usageEvents: params.usageEvents,
        pricingByModel: params.pricingByModel,
        context: params.context
      });
      if (result.status === "complete") {
        critiqueCache.set(cacheKey, result);
      }
      return result;
    })
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
    params.input.models.map(async (modelId) => {
      const messages = buildRevisionMessages({
        modelId,
        prompt: params.input.prompt,
        researchContext: params.researchContext,
        attachmentContext: params.attachmentContext,
        initialResponses: params.initialResponses,
        critiqueRounds: params.critiqueRounds
      });
      const cacheKey = makeMessagesCacheKey("revision", modelId, messages);
      const cached = revisionCache.get(cacheKey);
      if (cached) {
        await emit(params.context, {
          type: "stage",
          stage: "revision",
          message: `Using cached revision for ${modelId}.`
        });
        const usage = await recordCachedUsage({
          runId: params.runId,
          userId: params.context.userId,
          stage: "revision",
          modelId,
          usageEvents: params.usageEvents
        });
        const result: StageResult = {
          ...cached,
          id: crypto.randomUUID(),
          usage: emptyUsage(),
          latencyMs: 0
        };
        await persistModelResponse(params.runId, params.input.saveHistory, result);
        await emit(params.context, { type: "model_response", response: result });
        await emit(params.context, { type: "usage", usage });
        return result;
      }

      const result = await callModelStage({
        modelId,
        stage: "revision",
        messages,
        saveHistory: params.input.saveHistory,
        runId: params.runId,
        userId: params.context.userId,
        usageEvents: params.usageEvents,
        pricingByModel: params.pricingByModel,
        context: params.context
      });
      if (result.status === "complete") {
        revisionCache.set(cacheKey, result);
      }
      return result;
    })
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
    ...buildSharedPrefixMessages(
      params.input.prompt,
      params.research ? buildResearchContext(params.research) : "",
      params.attachmentContext
    ),
    { role: "user", content: promptText }
  ];
  const cacheKey = makeMessagesCacheKey("judge_synthesis", params.input.judgeModel, messages);
  const cached = judgeCache.get(cacheKey);
  if (cached) {
    await emit(params.context, {
      type: "stage",
      stage: "judge_synthesis",
      modelId: params.input.judgeModel,
      message: `Using cached judge synthesis for ${params.input.judgeModel}.`
    });
    const usage = await recordCachedUsage({
      runId: params.runId,
      userId: params.context.userId,
      stage: "judge_synthesis",
      modelId: params.input.judgeModel,
      usageEvents: params.usageEvents
    });
    const result: JudgeResult = {
      ...cached,
      id,
      usage: emptyUsage(),
      latencyMs: 0
    };
    await persistJudge(params.runId, params.input.saveHistory, result);
    await emit(params.context, { type: "judge", judge: result });
    await emit(params.context, { type: "usage", usage });
    return result;
  }

  let completion: CompletionResult;
  try {
    try {
      completion = await completeWithOpenRouter({
        model: params.input.judgeModel,
        messages,
        temperature: 0.2,
        maxTokens: 2200,
        responseFormat: "json_object",
        cacheControl: true
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
        maxTokens: 2200,
        cacheControl: true
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
    await emit(params.context, { type: "judge", judge: failedResult });
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
  judgeCache.set(cacheKey, result);
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
  await emit(params.context, { type: "judge", judge: result });

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
      maxTokens: 1800,
      cacheControl: true
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
    await emit(params.context, { type: "model_response", response: result });
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
  await emit(params.context, { type: "model_response", response: result });
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
      maxTokens: 1400,
      cacheControl: true
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
    await emit(params.context, { type: "critique", critique: result });
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
  await emit(params.context, { type: "critique", critique: result });
  return result;
}

function buildSharedPrefixMessages(prompt: string, researchContext: string, attachmentContext: string): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content:
        "You are a member or judge of a private AI council participating in a collaborative intelligence process."
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
    },
    {
      role: "assistant",
      content: "Acknowledged. Please provide the specific instructions and inputs for the current stage."
    }
  ];
}

function buildInitialMessages(prompt: string, researchContext: string, attachmentContext: string): ChatCompletionMessageParam[] {
  return [
    ...buildSharedPrefixMessages(prompt, researchContext, attachmentContext),
    {
      role: "user",
      content:
        "Produce an independent, high-quality answer to the user prompt. Use the supplied research and file contexts when relevant. Cite sources as [1], [2], etc."
    }
  ];
}

function programmaticSummarize(text: string, maxTokens: number = 200): string {
  if (!text) return "";
  const maxChars = maxTokens * 4.5;
  if (text.length <= maxChars) return text;

  const lines = text.split("\n");
  const extractedLines: string[] = [];
  let currentLength = 0;

  // Keep first few paragraphs as intro summary
  let introCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed === "") continue;
    extractedLines.push(line);
    currentLength += line.length + 1;
    introCount++;
    if (introCount >= 3 || currentLength > maxChars * 0.45) break;
  }

  // Scan for markdown headers and short summary bullets
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (line.startsWith("#")) {
      extractedLines.push(line);
      currentLength += line.length + 1;
      
      // Keep first line under header
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j]?.trim();
        if (nextLine && !nextLine.startsWith("#")) {
          extractedLines.push("  " + nextLine);
          currentLength += nextLine.length + 3;
          break;
        }
      }
    } else if (line.startsWith("-") || line.startsWith("*") || /^\d+\./.test(line)) {
      if (currentLength < maxChars * 0.8 && line.length < 150) {
        extractedLines.push(line);
        currentLength += line.length + 1;
      }
    }
    if (currentLength > maxChars) break;
  }

  const result = extractedLines.join("\n").trim();
  if (result.length > maxChars) {
    return result.slice(0, maxChars) + "\n...[truncated summary]";
  }
  return result;
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
    .filter((response) => response.modelId !== params.modelId || response.content)
    .map((response) => {
      const label = `${response.modelId}${response.modelId === params.modelId ? " (you)" : ""}`;
      const body = response.content
        ? (response.modelId === params.modelId ? truncate(response.content, PEER_ANSWER_CONTEXT_CHARS) : programmaticSummarize(response.content, 200))
        : `[no response: ${truncate(response.error ?? "empty", 160)}]`;
      return `${label}:\n${body}`;
    })
    .join("\n\n");
  const previous = params.previousRounds
    .flat()
    .filter((critique) => critique.content || critique.error)
    .map((critique) => `R${critique.roundIndex} ${critique.modelId}:\n${truncate(critique.content || critique.error || "", CRITIQUE_ROUND_CONTEXT_CHARS)}`)
    .join("\n\n");

  return [
    ...buildSharedPrefixMessages(params.prompt, params.researchContext, params.attachmentContext),
    {
      role: "user",
      content: [
        `Initial council answers:\n${peerResponses}`,
        previous && `Previous debate rounds:\n${previous}`,
        `This is debate round ${params.roundIndex}. Critique the other answers, name concrete weaknesses, keep what is strong, and propose improvements. Be concise and evidence-driven. Respond as ${params.modelId}.`
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
    .filter((critique) => critique.content || critique.error)
    .map((critique) => `R${critique.roundIndex} ${critique.modelId}:\n${truncate(critique.content || critique.error || "", CRITIQUE_ROUND_CONTEXT_CHARS)}`)
    .join("\n\n");

  return [
    ...buildSharedPrefixMessages(params.prompt, params.researchContext, params.attachmentContext),
    {
      role: "user",
      content: [
        `Your initial answer:\n${truncate(ownInitial, PEER_ANSWER_CONTEXT_CHARS)}`,
        `Council critiques:\n${critiques}`,
        "Write your revised answer now. Preserve correct details, fix weaknesses, and produce your strongest final answer."
      ]
        .filter(Boolean)
        .join("\n\n")
    }
  ];
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function normalizePromptContent(content: ChatCompletionMessageParam["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String(part.text);
        }
        return "";
      })
      .join("");
  }
  return "";
}

function buildJudgePrompt(params: {
  initialResponses: StageResult[];
  critiqueRounds: CritiqueResult[][];
  revisions: StageResult[];
}) {
  const initial = params.initialResponses
    .map((response) => `${response.modelId}:\n${truncate(response.content || response.error || "", PEER_ANSWER_CONTEXT_CHARS)}`)
    .join("\n\n");
  const debate = params.critiqueRounds
    .flat()
    .map((critique) => `R${critique.roundIndex} ${critique.modelId}:\n${truncate(critique.content || critique.error || "", CRITIQUE_ROUND_CONTEXT_CHARS)}`)
    .join("\n\n");
  const revisions = params.revisions
    .map((response) => `${response.modelId}:\n${truncate(response.content || response.error || "", PEER_ANSWER_CONTEXT_CHARS)}`)
    .join("\n\n");

  return `Initial answers:
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
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```json")) {
      cleanContent = cleanContent.slice(7).trim();
    }
    if (cleanContent.endsWith("```")) {
      cleanContent = cleanContent.slice(0, -3).trim();
    }
    const parsed = JSON.parse(cleanContent) as {
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

async function persistResearchResult(runId: string, userId: string, saveHistory: boolean, research: ResearchResult) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("research_results").insert({
    run_id: runId,
    user_id: userId,
    query: saveHistory ? research.query : null,
    results: saveHistory ? research.sources : null,
    result_count: research.sources.length,
    firecrawl_credits: research.credits,
    saved_mode: saveHistory
  });
  assertSupabaseOk("saving research results", error);
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

async function recordCachedUsage(params: {
  runId: string;
  userId: string;
  stage: CouncilStage;
  modelId: string;
  usageEvents: UsageEvent[];
}): Promise<UsageEvent> {
  const usage = buildUsageEvent({
    stage: params.stage,
    modelId: params.modelId,
    usage: { ...emptyUsage(), estimated: true },
    latencyMs: 0,
    status: "estimated"
  });
  params.usageEvents.push(usage);
  await persistRunUsage(params.runId, params.userId, usage);
  return usage;
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
