import { redirect } from "next/navigation";
import { UsageDashboard } from "@/components/admin-usage-dashboard";
import { requirePageProfile } from "@/lib/auth";

export default async function UsagePage({
  searchParams
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const profile = await requirePageProfile();
  const { member } = await searchParams;
  if (member && profile.role !== "admin") redirect("/app/usage");

  const memberId = profile.role === "admin" && member && member !== profile.id ? member : undefined;

  return (
    <main className="page stack">
      <div className="page-title">
        <h1>Usage</h1>
        <p>
          {memberId
            ? "Review this member's monthly spend, remaining budget, and recent council cost."
            : "See your monthly spend, remaining budget, and recent council cost."}
        </p>
      </div>
      <UsageDashboard canEditBudget={profile.role === "admin" && !memberId} memberId={memberId} />
    </main>
  );
}
