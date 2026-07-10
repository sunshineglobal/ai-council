import Link from "next/link";
import { Brain } from "lucide-react";
import { AppNavigation } from "@/components/app-navigation";
import { requirePageProfile } from "@/lib/auth";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const profile = await requirePageProfile();

  return (
    <div className="app-frame">
      <header className="topbar">
        <Link className="brand" href="/app">
          <span className="brand-mark">
            <Brain size={18} />
          </span>
          <span>AI Council</span>
        </Link>
        <AppNavigation isAdmin={profile.role === "admin"} />
      </header>
      {children}
    </div>
  );
}
