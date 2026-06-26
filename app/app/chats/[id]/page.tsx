import { CouncilWorkspace } from "@/components/council-workspace";
import { requirePageProfile } from "@/lib/auth";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requirePageProfile();
  const { id } = await params;
  return <CouncilWorkspace defaultSaveHistory={profile.default_save_history} initialThreadId={id} />;
}
