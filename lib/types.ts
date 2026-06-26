export type UserRole = "admin" | "member";

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimated?: boolean;
};

export type UsageEvent = TokenUsage & {
  stage: CouncilStage;
  modelId?: string;
  latencyMs: number;
  status: "complete" | "error" | "estimated";
  estimatedCost: number;
};

export type CouncilStage =
  | "research_context"
  | "initial_answer"
  | "debate_critique"
  | "revision"
  | "judge_synthesis"
  | "eval_scoring";

export type ModelOption = {
  id: string;
  name: string;
  contextLength?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
};

export type ResearchSource = {
  title: string;
  url: string;
  description?: string;
  markdown?: string;
  snippet: string;
};

export type ResearchResult = {
  query: string;
  sources: ResearchSource[];
  credits: number;
  estimatedContextTokens: number;
};

export type CouncilAttachment = {
  id: string;
  filename: string;
  contentType: string;
  fileSize: number;
  textPreview?: string;
  extractedText?: string;
  extractionStatus: "ready" | "unsupported" | "too_large" | "failed" | "none";
  extractionError?: string;
  createdAt: string;
};

export type StageResult = {
  id: string;
  modelId: string;
  stage: "initial_answer" | "revision";
  content: string;
  usage: TokenUsage;
  latencyMs: number;
  status: "complete" | "error";
  error?: string;
};

export type CritiqueResult = {
  id: string;
  roundIndex: number;
  modelId: string;
  content: string;
  usage: TokenUsage;
  latencyMs: number;
  status: "complete" | "error";
  error?: string;
};

export type JudgeRanking = {
  modelId: string;
  rank: number;
  score: number;
  rationale: string;
};

export type JudgeResult = {
  id: string;
  modelId: string;
  synthesis: string;
  rankings: JudgeRanking[];
  usage: TokenUsage;
  latencyMs: number;
  status: "complete" | "error";
  error?: string;
};

export type TokenTotals = TokenUsage & {
  byStage: Record<string, TokenUsage>;
  byModel: Record<string, TokenUsage>;
};

export type CouncilRunResult = {
  id: string;
  threadId?: string;
  prompt?: string;
  finalAnswer: string;
  models: string[];
  judgeModel: string;
  debateDepth: number;
  researchEnabled: boolean;
  savedMode: boolean;
  attachments: CouncilAttachment[];
  research?: ResearchResult;
  initialResponses: StageResult[];
  critiqueRounds: CritiqueResult[][];
  revisions: StageResult[];
  judge: JudgeResult;
  usageEvents: UsageEvent[];
  tokenTotals: TokenTotals;
  costEstimate: number;
  latencyMs: number;
  createdAt: string;
};

export type CouncilRunInput = {
  prompt: string;
  models: string[];
  judgeModel: string;
  debateDepth: number;
  researchEnabled: boolean;
  saveHistory: boolean;
  threadId?: string;
  attachmentIds?: string[];
};

export type AuthProfile = {
  id: string;
  email: string;
  role: UserRole;
  default_save_history: boolean;
  monthly_budget_usd: number | null;
};

export type CouncilEvent =
  | { type: "started"; runId: string }
  | { type: "research"; research: ResearchResult }
  | { type: "stage"; stage: CouncilStage; modelId?: string; message: string }
  | { type: "usage"; usage: UsageEvent }
  | { type: "model_response"; response: StageResult }
  | { type: "critique"; critique: CritiqueResult }
  | { type: "judge"; judge: JudgeResult }
  | { type: "complete"; result: CouncilRunResult }
  | { type: "error"; message: string };
