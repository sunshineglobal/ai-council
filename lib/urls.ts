export function localRedirectPath(value: string | null | undefined, fallback = "/app"): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return fallback;

  try {
    const base = new URL("https://local.invalid");
    const target = new URL(value, base);
    if (target.origin !== base.origin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
