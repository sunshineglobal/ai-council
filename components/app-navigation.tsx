"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Brain, LogOut, Shield } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";

type AppNavigationProps = {
  isAdmin: boolean;
};

const links = [
  { href: "/app", label: "Council", Icon: Brain },
  { href: "/app/evals", label: "Evals", Icon: BarChart3 }
] as const;

export function AppNavigation({ isAdmin }: AppNavigationProps) {
  const pathname = usePathname();

  return (
    <nav className="topbar-nav" aria-label="App navigation">
      {links.map(({ href, label, Icon }) => (
        <Link
          aria-current={isCurrentPath(pathname, href) ? "page" : undefined}
          className="nav-link"
          href={href}
          key={href}
        >
          <Icon size={16} />
          {label}
        </Link>
      ))}
      {isAdmin ? (
        <Link
          aria-current={isCurrentPath(pathname, "/app/admin") ? "page" : undefined}
          className="nav-link"
          href="/app/admin"
        >
          <Shield size={16} />
          Admin
        </Link>
      ) : null}
      <SignOutButton>
        <LogOut size={16} />
        Sign out
      </SignOutButton>
    </nav>
  );
}

function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === href || pathname.startsWith("/app/chats/");
  return pathname === href || pathname.startsWith(`${href}/`);
}
