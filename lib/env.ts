export function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function getAppUrl(): string {
  return getOptionalEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
}

export const requiredSetupEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENROUTER_API_KEY",
  "FIRECRAWL_API_KEY",
  "INITIAL_ADMIN_EMAIL"
] as const;

export function missingEnvVars(names: readonly string[] = requiredSetupEnvVars): string[] {
  return names.filter((name) => !getOptionalEnv(name));
}

export function hasSupabaseEnv(): boolean {
  return missingEnvVars([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY"
  ]).length === 0;
}
