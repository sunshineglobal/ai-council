import { redirect } from "next/navigation";
import { AdminInvites } from "@/components/admin-invites";
import { requirePageProfile } from "@/lib/auth";

export default async function AdminPage() {
  const profile = await requirePageProfile();
  if (profile.role !== "admin") redirect("/app");

  return (
    <main className="page stack">
      <div className="page-title">
        <h1>Admin</h1>
        <p>Manage invited emails for this private AI Council.</p>
      </div>
      <AdminInvites />
    </main>
  );
}
