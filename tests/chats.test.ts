import { describe, expect, it } from "vitest";
import {
  assembleChatDetails,
  decodeChatCursor,
  decodeRunCursor,
  encodeChatCursor,
  encodeRunCursor,
  findUnreferencedAttachmentIds
} from "@/lib/chats";
import type {
  StoredCritique,
  StoredJudge,
  StoredModelResponse,
  StoredResearch,
  StoredRun,
  StoredRunAttachment,
  StoredUsage
} from "@/lib/chats/types";

describe("chat detail assembly", () => {
  it("attaches files to their runs while preserving the top-level payload", () => {
    const runs = [storedRun("run-1", "First"), storedRun("run-2", "Second"), storedRun("run-3", "No files")];
    const attachments: StoredRunAttachment[] = [
      { id: "attachment-1", run_id: "run-1", filename: "first.txt" },
      { id: "attachment-2", run_id: "run-2", filename: "second.txt" },
      { id: "attachment-3", run_id: "run-1", filename: "third.txt" }
    ];
    const response: StoredModelResponse = {
      id: "response-1",
      run_id: "run-1",
      model_id: "model-a",
      stage: "initial_answer",
      content: "Answer",
      token_usage: tokenUsage,
      latency_ms: 10,
      status: "complete",
      error: null
    };
    const critique: StoredCritique = {
      id: "critique-1",
      run_id: "run-1",
      round_index: 1,
      model_id: "model-a",
      content: "Review",
      token_usage: tokenUsage,
      latency_ms: 10,
      status: "complete",
      error: null
    };
    const judge: StoredJudge = {
      id: "judge-1",
      run_id: "run-1",
      judge_model: "judge-a",
      rankings: [],
      synthesis: "Final",
      token_usage: tokenUsage,
      latency_ms: 10,
      status: "complete",
      error: null
    };
    const research: StoredResearch = {
      run_id: "run-1",
      query: "Question",
      results: [],
      result_count: 0,
      firecrawl_credits: 0
    };
    const usage: StoredUsage = {
      run_id: "run-1",
      stage: "initial_answer",
      model_id: "model-a",
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
      latency_ms: 10,
      status: "complete",
      estimated_cost: 0
    };

    const details = assembleChatDetails({
      thread: { id: "thread-1", title: "Chat" },
      runs,
      responses: [response],
      critiques: [critique],
      judges: [judge],
      research: [research],
      usage: [usage],
      attachments
    });

    expect(details).toEqual({
      thread: { id: "thread-1", title: "Chat" },
      runs: [
        { ...runs[0], attachments: [attachments[0], attachments[2]] },
        { ...runs[1], attachments: [attachments[1]] },
        { ...runs[2], attachments: [] }
      ],
      responses: [response],
      critiques: [critique],
      judges: [judge],
      research: [research],
      usage: [usage],
      attachments
    });
    expect(runs.every((run) => !("attachments" in run))).toBe(true);
  });
});

const tokenUsage = { promptTokens: 1, completionTokens: 1, totalTokens: 2 };
const tokenTotals = { ...tokenUsage, byStage: {}, byModel: {} };

function storedRun(id: string, prompt: string): StoredRun {
  return {
    id,
    prompt_text: prompt,
    final_answer: "Final",
    token_totals: tokenTotals,
    created_at: "2026-07-10T00:00:00.000Z",
    models: ["model-a"],
    judge_model: "judge-a",
    debate_depth: 1,
    research_enabled: false,
    status: "complete",
    error_message: null,
    latency_ms: 10
  };
}

describe("chat attachment cleanup", () => {
  it("selects only files with no remaining run references", () => {
    expect(
      findUnreferencedAttachmentIds(
        ["unreferenced", "shared", "also-unreferenced"],
        [{ file_id: "shared" }, { file_id: null }, { file_id: "unrelated" }]
      )
    ).toEqual(["unreferenced", "also-unreferenced"]);
  });
});

describe("chat list cursors", () => {
  it("round-trips cursor payloads", () => {
    const cursor = encodeChatCursor({
      id: "chat-1",
      updated_at: "2026-08-08T12:00:00.000Z"
    });
    expect(decodeChatCursor(cursor)).toEqual({
      id: "chat-1",
      updated_at: "2026-08-08T12:00:00.000Z"
    });
    expect(decodeChatCursor("not-valid")).toBeNull();
  });
});

describe("thread run cursors", () => {
  it("round-trips run cursor payloads", () => {
    const cursor = encodeRunCursor({
      id: "run-1",
      created_at: "2026-08-08T12:00:00.000Z"
    });
    expect(decodeRunCursor(cursor)).toEqual({
      id: "run-1",
      created_at: "2026-08-08T12:00:00.000Z"
    });
    expect(decodeRunCursor("nope")).toBeNull();
  });
});
