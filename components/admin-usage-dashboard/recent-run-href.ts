import type { RecentCouncilRun } from "@/lib/admin/usage-types";

export function recentRunHref(run: Pick<RecentCouncilRun, "threadId">, linkToChats: boolean): string | null {
  if (!linkToChats || !run.threadId) return null;
  return `/app/chats/${run.threadId}`;
}
