import {
  buildAttachmentContext,
  cleanupEphemeralAttachments,
  loadUserAttachments,
  persistRunAttachments,
  toPublicAttachment
} from "@/lib/attachments";
import { isCouncilAbortError, throwIfCouncilAborted } from "@/lib/council/abort";
import { emitCouncilEvent as emit, type CouncilRunContext } from "@/lib/council/context";
import { toUserFacingCouncilError } from "@/lib/council/errors";
import { validateCouncilInput } from "@/lib/council/input";
import {
  createCouncilThread,
  deleteThreadIfOrphaned,
  insertDebateRound,
  insertCouncilRun,
  markCouncilRunComplete,
  markCouncilRunFailed,
  touchCouncilThread,
  verifyOwnedThread,
  type CouncilAdminClient
} from "@/lib/council/persistence";
import {
  runCritiqueRound,
  runInitialStage,
  runJudgeStage,
  runResearchStage,
  runRevisionStage
} from "@/lib/council/stages";
import { loadCouncilPricing } from "@/lib/council/usage";
import { getErrorLog } from "@/lib/errors";
import { compactText } from "@/lib/format";
import { buildResearchContext } from "@/lib/firecrawl";
import { assertModelPricingAvailable } from "@/lib/production-guardrails";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { summarizeUsage } from "@/lib/token-usage";
import type {
  CouncilAttachment,
  CouncilRunInput,
  CouncilRunResult,
  CritiqueResult,
  UsageEvent
} from "@/lib/types";

export async function runCouncil(input: CouncilRunInput, context: CouncilRunContext): Promise<CouncilRunResult> {
  const runId = crypto.randomUUID();
  const started = Date.now();
  const usageEvents: UsageEvent[] = [];
  let admin: CouncilAdminClient | undefined;
  let attachments: CouncilAttachment[] = [];
  let threadId: string | undefined;
  let newlyCreatedThreadId: string | undefined;
  let runCreated = false;
  let runCompleted = false;

  try {
    admin = createSupabaseAdminClient();
    validateCouncilInput(input);
    throwIfCouncilAborted(context.signal);

    const pricingByModel = await loadCouncilPricing();
    assertModelPricingAvailable([...input.models, input.judgeModel], pricingByModel);
    throwIfCouncilAborted(context.signal);
    attachments = await loadUserAttachments(admin, context.userId, input.attachmentIds ?? []);
    const attachmentContext = buildAttachmentContext(attachments);

    if (input.saveHistory && input.threadId) {
      await verifyOwnedThread(admin, input.threadId, context.userId);
      threadId = input.threadId;
    } else if (input.saveHistory) {
      threadId = await createCouncilThread(admin, {
        userId: context.userId,
        title: compactText(input.prompt, 72)
      });
      newlyCreatedThreadId = threadId;
    }

    await insertCouncilRun(admin, {
      id: runId,
      threadId,
      userId: context.userId,
      input
    });
    runCreated = true;

    if (input.saveHistory) {
      await persistRunAttachments({
        admin,
        runId,
        userId: context.userId,
        attachments
      });
    }

    await emit(context, { type: "started", runId, threadId });
    if (attachments.length) {
      await emit(context, {
        type: "stage",
        stage: "initial_answer",
        message: `Loaded ${attachments.length} attached ${attachments.length === 1 ? "file" : "files"}.`
      });
    }

    const research = input.researchEnabled
      ? await runResearchStage(admin, input.prompt, input.saveHistory, runId, context, usageEvents)
      : undefined;
    throwIfCouncilAborted(context.signal);

    const researchContext = buildResearchContext(research);
    const initialResponses = await runInitialStage(
      admin,
      input,
      researchContext,
      attachmentContext,
      context,
      runId,
      usageEvents,
      pricingByModel
    );
    throwIfCouncilAborted(context.signal);

    if (!initialResponses.some((result) => result.status === "complete" && result.content.trim())) {
      const reasons = initialResponses.map((result) => `${result.modelId}: ${result.error ?? "empty response"}`).join("; ");
      throw new Error(`Every council model failed during the initial answer stage. ${reasons}`);
    }

    const critiqueRounds: CritiqueResult[][] = [];
    for (let roundIndex = 1; roundIndex <= input.debateDepth; roundIndex += 1) {
      await insertDebateRound(admin, { runId, roundIndex });
      const round = await runCritiqueRound({
        admin,
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
      throwIfCouncilAborted(context.signal);
    }

    const revisions = await runRevisionStage({
      admin,
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
    throwIfCouncilAborted(context.signal);

    const judge = await runJudgeStage({
      admin,
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
    if (judge.status !== "complete" || !judge.synthesis.trim()) {
      throw new Error(judge.error ?? "The judge model failed before it could synthesize a final answer.");
    }
    throwIfCouncilAborted(context.signal);

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
      attachments: attachments.map(toPublicAttachment),
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

    if (threadId) await touchCouncilThread(admin, { threadId, userId: context.userId });
    await markCouncilRunComplete(admin, {
      runId,
      userId: context.userId,
      finalAnswer: input.saveHistory ? judge.synthesis : null,
      tokenTotals,
      costEstimate,
      latencyMs
    });
    runCompleted = true;

    await emit(context, { type: "complete", result });
    return result;
  } catch (error) {
    const aborted = isCouncilAbortError(error, context.signal);
    const message = toUserFacingCouncilError(error, context.signal);
    if (aborted) {
      console.info("[council] run stopped", { runId, userId: context.userId });
    } else {
      console.error("[council] run failed", {
        runId,
        userId: context.userId,
        ...getErrorLog(error)
      });
    }

    if (admin && runCreated && !runCompleted) {
      try {
        await markCouncilRunFailed(admin, {
          runId,
          userId: context.userId,
          latencyMs: Date.now() - started,
          errorMessage: message
        });
      } catch (updateError) {
        console.error("[council] could not mark run failed", {
          runId,
          userId: context.userId,
          ...getErrorLog(updateError)
        });
      }
    } else if (admin && !runCreated && newlyCreatedThreadId) {
      try {
        await deleteThreadIfOrphaned(admin, {
          threadId: newlyCreatedThreadId,
          userId: context.userId
        });
      } catch (cleanupError) {
        console.error("[council] could not clean up an orphaned chat thread", {
          threadId: newlyCreatedThreadId,
          userId: context.userId,
          ...getErrorLog(cleanupError)
        });
      }
    }

    await emit(context, {
      type: "error",
      message,
      runId: runCreated ? runId : undefined,
      threadId: threadId ?? newlyCreatedThreadId
    });
    throw error;
  } finally {
    if (admin && !input.saveHistory && attachments.length) {
      try {
        await cleanupEphemeralAttachments({
          admin,
          userId: context.userId,
          attachmentIds: attachments.map((attachment) => attachment.id)
        });
      } catch (cleanupError) {
        console.warn("[council] could not clean up ephemeral attachments", {
          runId,
          userId: context.userId,
          ...getErrorLog(cleanupError)
        });
      }
    }
  }
}
