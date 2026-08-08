import { redirect } from "next/navigation";
import { AdminInvites } from "@/components/admin-invites";
import { AdminMembers } from "@/components/admin-members";
import { AdminUsageDashboard } from "@/components/admin-usage-dashboard";
import { requirePageProfile } from "@/lib/auth";

export default async function AdminPage() {
  const profile = await requirePageProfile();
  if (profile.role !== "admin") redirect("/app");

  return (
    <main className="page stack">
      <div className="page-title">
        <h1>Admin</h1>
        <p>Track org and personal usage, set member budgets, and manage invites.</p>
      </div>
      <AdminMembers />
      <AdminUsageDashboard />
      <AdminInvites />
    </main>
  );
}
