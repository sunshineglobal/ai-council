import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Brain, LogOut, Shield } from "lucide-react";
import { requirePageProfile } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const profile = await requirePageProfile();
  if (!profile) redirect("/login");

  return (
    <div className="app-frame">
      <header className="topbar">
        <Link className="brand" href="/app">
          <span className="brand-mark">
            <Brain size={18} />
          </span>
          <span>AI Council</span>
        </Link>
        <nav className="topbar-nav" aria-label="App navigation">
          <Link className="nav-link" href="/app">
            <Brain size={16} />
            Council
          </Link>
          <Link className="nav-link" href="/app/evals">
            <BarChart3 size={16} />
            Evals
          </Link>
          {profile.role === "admin" ? (
            <Link className="nav-link" href="/app/admin">
              <Shield size={16} />
              Admin
            </Link>
          ) : null}
          <SignOutButton>
            <LogOut size={16} />
            Sign out
          </SignOutButton>
        </nav>
      </header>
      {children}
    </div>
  );
}
