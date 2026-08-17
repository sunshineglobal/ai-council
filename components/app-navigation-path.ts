export function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === href || pathname.startsWith("/app/chats/");
  return pathname === href || pathname.startsWith(`${href}/`);
}
