import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { isCouncilAbortError } from "@/lib/council/abort";
import { emitCouncilEvent as emit, type CouncilRunContext } from "@/lib/council/context";
import {
  persistCritique,
  persistModelResponse,
  type CouncilAdminClient
} from "@/lib/council/persistence";
import { recordCompletionUsage } from "@/lib/council/usage";
import { getErrorLog } from "@/lib/errors";
import { completeWithOpenRouter, type CompletionResult } from "@/lib/openrouter";
import { emptyUsage } from "@/lib/token-usage";
import type { ModelPricingMap } from "@/lib/usage";
import type {
  CouncilStage,
  CritiqueResult,
  StageResult,
  UsageEvent
} from "@/lib/types";

type ModelCompletionResult = StageResult | CritiqueResult;

async function runModelCompletion<Result extends ModelCompletionResult>(params: {
  admin: CouncilAdminClient;
  modelId: string;
  stage: CouncilStage;
  messages: ChatCompletionMessageParam[];
  temperature: number;
  maxTokens: number;
  runId: string;
  userId: string;
  usageEvents: UsageEvent[];
  pricingByModel: ModelPricingMap;
  context: CouncilRunContext;
  failureLogMessage: string;
  failureLogDetails: Record<string, unknown>;
  buildFailedResult: (id: string) => Result;
  buildCompleteResult: (id: string, completion: CompletionResult) => Result;
  persistResult: (result: Result) => Promise<void>;
  emitResult: (result: Result) => Promise<void>;
}): Promise<Result> {
  const id = crypto.randomUUID();
  let completion: CompletionResult;
  try {
    completion = await completeWithOpenRouter({
      model: params.modelId,
      messages: params.messages,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      cacheControl: true,
      signal: params.context.signal
    });
  } catch (error) {
    if (isCouncilAbortError(error, params.context.signal)) throw error;
    console.warn(params.failureLogMessage, {
      ...params.failureLogDetails,
      ...getErrorLog(error)
    });
    const result = params.buildFailedResult(id);
    await params.persistResult(result);
    await params.emitResult(result);
    return result;
  }

  const result = params.buildCompleteResult(id, completion);
  await params.persistResult(result);
  await recordCompletionUsage({
    admin: params.admin,
    runId: params.runId,
    userId: params.userId,
    stage: params.stage,
    modelId: params.modelId,
    completion,
    pricingByModel: params.pricingByModel,
    usageEvents: params.usageEvents,
    emit: (event) => emit(params.context, event)
  });
  await params.emitResult(result);
  return result;
}

export async function callModelStage(params: {
  admin: CouncilAdminClient;
  modelId: string;
  stage: "initial_answer" | "revision";
  messages: ChatCompletionMessageParam[];
  saveHistory: boolean;
  runId: string;
  userId: string;
  usageEvents: UsageEvent[];
  pricingByModel: ModelPricingMap;
  context: CouncilRunContext;
}): Promise<StageResult> {
  return runModelCompletion<StageResult>({
    admin: params.admin,
    modelId: params.modelId,
    stage: params.stage,
    messages: params.messages,
    temperature: params.stage === "initial_answer" ? 0.55 : 0.35,
    maxTokens: 1800,
    runId: params.runId,
    userId: params.userId,
    usageEvents: params.usageEvents,
    pricingByModel: params.pricingByModel,
    context: params.context,
    failureLogMessage: "[council] model request failed",
    failureLogDetails: {
      runId: params.runId,
      stage: params.stage,
      modelId: params.modelId
    },
    buildFailedResult: (id) => ({
      id,
      modelId: params.modelId,
      stage: params.stage,
      content: "",
      usage: emptyUsage(),
      latencyMs: 0,
      status: "error",
      error: "Model request failed."
    }),
    buildCompleteResult: (id, completion) => ({
      id,
      modelId: params.modelId,
      stage: params.stage,
      content: completion.content,
      usage: completion.usage,
      latencyMs: completion.latencyMs,
      status: "complete"
    }),
    persistResult: (result) => persistModelResponse(params.admin, params.runId, params.saveHistory, result),
    emitResult: (result) => emit(params.context, { type: "model_response", response: result })
  });
}

export async function callCritiqueStage(params: {
  admin: CouncilAdminClient;
  modelId: string;
  messages: ChatCompletionMessageParam[];
  saveHistory: boolean;
  roundIndex: number;
  runId: string;
  userId: string;
  usageEvents: UsageEvent[];
  pricingByModel: ModelPricingMap;
  context: CouncilRunContext;
}): Promise<CritiqueResult> {
  return runModelCompletion<CritiqueResult>({
    admin: params.admin,
    modelId: params.modelId,
    stage: "debate_critique",
    messages: params.messages,
    temperature: 0.45,
    maxTokens: 1400,
    runId: params.runId,
    userId: params.userId,
    usageEvents: params.usageEvents,
    pricingByModel: params.pricingByModel,
    context: params.context,
    failureLogMessage: "[council] critique request failed",
    failureLogDetails: {
      runId: params.runId,
      roundIndex: params.roundIndex,
      modelId: params.modelId
    },
    buildFailedResult: (id) => ({
      id,
      roundIndex: params.roundIndex,
      modelId: params.modelId,
      content: "",
      usage: emptyUsage(),
      latencyMs: 0,
      status: "error",
      error: "Critique request failed."
    }),
    buildCompleteResult: (id, completion) => ({
      id,
      roundIndex: params.roundIndex,
      modelId: params.modelId,
      content: completion.content,
      usage: completion.usage,
      latencyMs: completion.latencyMs,
      status: "complete"
    }),
    persistResult: (result) => persistCritique(params.admin, params.runId, params.saveHistory, result),
    emitResult: (result) => emit(params.context, { type: "critique", critique: result })
  });
}
