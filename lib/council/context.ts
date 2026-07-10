import { throwIfCouncilAborted } from "@/lib/council/abort";
import type { CouncilEvent } from "@/lib/types";

export type CouncilRunContext = {
  userId: string;
  userEmail: string;
  onEvent?: (event: CouncilEvent) => void | Promise<void>;
  signal?: AbortSignal;
};

export async function emitCouncilEvent(context: CouncilRunContext, event: CouncilEvent): Promise<void> {
  if (event.type !== "error") throwIfCouncilAborted(context.signal);
  await context.onEvent?.(event);
}
