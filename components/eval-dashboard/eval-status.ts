import { parseEvalSetItems } from "@/lib/evals/resume";

export function evalItemCount(items: unknown): number {
  return parseEvalSetItems(items).length;
}

export function formatEvalStatus(status: string, scored: number, total: number): string {
  if (status === "partial") {
    return total > 0 ? `partial (${scored}/${total})` : "partial";
  }
  if (status === "failed" && scored > 0 && total > scored) {
    return `partial (${scored}/${total})`;
  }
  return status;
}

export function canResumeEval(status: string, scored: number, total: number): boolean {
  if (total <= 0 || scored >= total) return false;
  return status === "partial" || status === "failed";
}

export function evalNoticeClass(kind: "error" | "status" | "success"): string {
  if (kind === "error") return "error-text";
  if (kind === "success") return "success-text";
  return "muted";
}
