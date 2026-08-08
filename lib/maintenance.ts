import { cleanupExpiredEphemeralAttachments } from "@/lib/attachments";
import { getEphemeralAttachmentTtlHours } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const STALE_RUN_MINUTES = 15;

export type MaintenanceResult = {
  expiredAttachments: number;
  staleCouncilRuns: number;
  staleEvalRuns: number;
  prunedGuardrailRows: number;
};

export async function runProductionMaintenance(): Promise<MaintenanceResult> {
  const admin = createSupabaseAdminClient();
  const attachmentCutoff = new Date(
    Date.now() - getEphemeralAttachmentTtlHours() * 60 * 60 * 1000
  ).toISOString();
  const staleCutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60 * 1000).toISOString();

  const expiredAttachments = await cleanupExpiredEphemeralAttachments({
    admin,
    olderThan: attachmentCutoff
  });

  const { data: staleCouncil, error: councilError } = await admin
    .from("council_runs")
    .update({
      status: "failed",
      error_message: "Run timed out or was interrupted.",
      updated_at: new Date().toISOString()
    })
    .eq("status", "running")
    .lt("updated_at", staleCutoff)
    .select("id");
  if (councilError) throw councilError;

  const { data: staleEvals, error: evalError } = await admin
    .from("eval_runs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString()
    })
    .eq("status", "running")
    .lt("created_at", staleCutoff)
    .select("id");
  if (evalError) throw evalError;

  const { data: pruned, error: pruneError } = await admin.rpc("prune_production_guardrails");
  if (pruneError) throw pruneError;

  return {
    expiredAttachments,
    staleCouncilRuns: staleCouncil?.length ?? 0,
    staleEvalRuns: staleEvals?.length ?? 0,
    prunedGuardrailRows: Number(pruned) || 0
  };
}
