import { CouncilWorkspace } from "@/components/council-workspace";
import { requirePageProfile } from "@/lib/auth";

export default async function AppPage() {
  const profile = await requirePageProfile();
  return <CouncilWorkspace defaultSaveHistory={profile.default_save_history} />;
}
