import { redirect } from "next/navigation";
import { AdminInvites } from "@/components/admin-invites";
import { AdminMembers } from "@/components/admin-members";
import { requirePageProfile } from "@/lib/auth";

export default async function AdminPage() {
  const profile = await requirePageProfile();
  if (profile.role !== "admin") redirect("/app");

  return (
    <main className="page stack">
      <div className="page-title">
        <h1>Admin</h1>
        <p>Set member budgets and manage invites. Personal spend is on Usage.</p>
      </div>
      <AdminMembers />
      <AdminInvites />
    </main>
  );
}
