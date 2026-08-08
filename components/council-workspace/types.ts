export type {
  ChatSummary,
  StoredAttachment,
  StoredCritique,
  StoredJudge,
  StoredModelResponse,
  StoredResearch,
  StoredRun,
  StoredRunAttachment,
  StoredUsage,
  ThreadDetailsPage,
  ThreadPayload
} from "@/lib/chats/types";

export type SubmittedRunConfig = {
  models: string[];
  judgeModel: string;
  debateDepth: number;
  researchEnabled: boolean;
  saveHistory: boolean;
  threadId?: string;
};
