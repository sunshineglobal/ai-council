import { summarizeUsage } from "@/lib/token-usage";
import type {
  CouncilAttachment,
  CouncilEvent,
  CouncilRunResult,
  CritiqueResult,
  JudgeResult,
  ResearchResult,
  StageResult,
  UsageEvent
} from "@/lib/types";
import type { SubmittedRunConfig } from "@/components/council-workspace/types";

export type LiveRunPhase = "idle" | "running" | "stopping";

export type LiveRunState = {
  phase: LiveRunPhase;
  error: string;
  prompt: string;
  attachments: CouncilAttachment[];
  config: SubmittedRunConfig | null;
  startedAt: string;
  statusLog: string[];
  usageEvents: UsageEvent[];
  result: CouncilRunResult | null;
  initialResponses: StageResult[];
  critiqueRounds: CritiqueResult[][];
  revisions: StageResult[];
  judge: JudgeResult | null;
  research?: ResearchResult;
};

export type LiveRunAction =
  | {
      type: "start";
      prompt: string;
      attachments: CouncilAttachment[];
      config: SubmittedRunConfig;
      startedAt: string;
    }
  | { type: "stop_requested" }
  | { type: "stopped" }
  | { type: "finish" }
  | { type: "event"; event: CouncilEvent }
  | { type: "set_error"; message: string }
  | { type: "clear_error" }
  | { type: "synced_to_thread" }
  | { type: "reset" };

export const initialLiveRunState: LiveRunState = {
  phase: "idle",
  error: "",
  prompt: "",
  attachments: [],
  config: null,
  startedAt: "",
  statusLog: [],
  usageEvents: [],
  result: null,
  initialResponses: [],
  critiqueRounds: [],
  revisions: [],
  judge: null,
  research: undefined
};

export function liveRunReducer(state: LiveRunState, action: LiveRunAction): LiveRunState {
  switch (action.type) {
    case "start":
      return {
        ...initialLiveRunState,
        phase: "running",
        prompt: action.prompt,
        attachments: [...action.attachments],
        config: { ...action.config, models: [...action.config.models] },
        startedAt: action.startedAt,
        statusLog: ["Starting council run."]
      };
    case "stop_requested":
      if (state.phase !== "running") return state;
      return {
        ...state,
        phase: "stopping",
        statusLog: appendUniqueStatus(state.statusLog, "Stopping council run.")
      };
    case "stopped":
      return {
        ...state,
        phase: "idle",
        error: "",
        statusLog: appendUniqueStatus(state.statusLog, "Council run stopped.")
      };
    case "finish":
      return state.phase === "idle" ? state : { ...state, phase: "idle" };
    case "event":
      return reduceCouncilEvent(state, action.event);
    case "set_error":
      return { ...state, error: action.message };
    case "clear_error":
      return state.error ? { ...state, error: "" } : state;
    case "synced_to_thread":
    case "reset":
      return initialLiveRunState;
    default:
      return state;
  }
}

export function buildLiveRunResult(state: LiveRunState): CouncilRunResult | null {
  if (state.result) return state.result;
  if (state.phase === "idle" || !state.config) return null;

  const tokenTotals = summarizeUsage(state.usageEvents);
  const costEstimate = state.usageEvents.reduce((sum, usage) => sum + usage.estimatedCost, 0);

  return {
    id: "live",
    finalAnswer: state.judge?.synthesis ?? "",
    models: state.config.models,
    judgeModel: state.config.judgeModel,
    debateDepth: state.config.debateDepth,
    researchEnabled: state.config.researchEnabled,
    savedMode: state.config.saveHistory,
    attachments: state.attachments,
    research: state.research,
    initialResponses: state.initialResponses,
    critiqueRounds: state.critiqueRounds,
    revisions: state.revisions,
    judge: state.judge ?? {
      id: "live-judge",
      modelId: state.config.judgeModel,
      synthesis: "",
      rankings: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: 0,
      status: "complete"
    },
    usageEvents: state.usageEvents,
    tokenTotals,
    costEstimate,
    latencyMs: 0,
    createdAt: state.startedAt
  };
}

function reduceCouncilEvent(state: LiveRunState, event: CouncilEvent): LiveRunState {
  switch (event.type) {
    case "started":
      return state;
    case "stage":
      return { ...state, statusLog: [...state.statusLog, event.message] };
    case "research":
      return {
        ...state,
        research: event.research,
        statusLog: [...state.statusLog, `Found ${event.research.sources.length} detailed Firecrawl sources.`]
      };
    case "usage":
      return { ...state, usageEvents: [...state.usageEvents, event.usage] };
    case "model_response":
      return event.response.stage === "initial_answer"
        ? { ...state, initialResponses: upsertModelResponse(state.initialResponses, event.response) }
        : { ...state, revisions: upsertModelResponse(state.revisions, event.response) };
    case "critique":
      return { ...state, critiqueRounds: upsertCritique(state.critiqueRounds, event.critique) };
    case "judge":
      return { ...state, judge: event.judge };
    case "complete":
      return {
        ...state,
        result: event.result,
        statusLog: [...state.statusLog, "Council run complete."]
      };
    case "error":
      return { ...state, error: event.message };
    default:
      return state;
  }
}

function upsertModelResponse(current: StageResult[], response: StageResult): StageResult[] {
  const index = current.findIndex((item) => item.modelId === response.modelId);
  if (index === -1) return [...current, response];
  const next = [...current];
  next[index] = response;
  return next;
}

function upsertCritique(current: CritiqueResult[][], critique: CritiqueResult): CritiqueResult[][] {
  const roundIndex = Math.max(0, critique.roundIndex - 1);
  const round = [...(current[roundIndex] ?? [])];
  const critiqueIndex = round.findIndex((item) => item.modelId === critique.modelId);

  if (critiqueIndex === -1) {
    round.push(critique);
  } else {
    round[critiqueIndex] = critique;
  }

  const next = [...current];
  next[roundIndex] = round;
  return next;
}

function appendUniqueStatus(statusLog: string[], message: string): string[] {
  return statusLog.at(-1) === message ? statusLog : [...statusLog, message];
}
