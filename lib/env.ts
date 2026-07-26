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
  const value = getOptionalEnv("NEXT_PUBLIC_APP_URL");
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Missing required environment variable: NEXT_PUBLIC_APP_URL");
    }
    return "http://localhost:3000";
  }

  const url = parseHttpUrl("NEXT_PUBLIC_APP_URL", value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS in production.");
  }
  return url.origin;
}

const baseRequiredSetupEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENROUTER_API_KEY"
] as const;

export const requiredSetupEnvVars = process.env.NODE_ENV === "production"
  ? [
      ...baseRequiredSetupEnvVars,
      "NEXT_PUBLIC_APP_URL",
      "ALLOWED_MODEL_IDS",
      "DEFAULT_MONTHLY_BUDGET_USD",
      "CRON_SECRET"
    ] as const
  : baseRequiredSetupEnvVars;

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

export function getAllowedModelIds(): string[] {
  const configured = getOptionalEnv("ALLOWED_MODEL_IDS");
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Missing required environment variable: ALLOWED_MODEL_IDS");
    }
    return [
      "minimax/minimax-m3",
      "stepfun/step-3.7-flash",
      "xiaomi/mimo-v2.5-pro",
      "z-ai/glm-5.2"
    ];
  }

  const ids = [...new Set(configured.split(",").map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) throw new Error("ALLOWED_MODEL_IDS must contain at least one model id.");
  return ids;
}

export function getDefaultMonthlyBudgetUsd(): number {
  return parseNumberEnv("DEFAULT_MONTHLY_BUDGET_USD", 25, { min: 0.01, max: 999999.999999 });
}

export function getMaxUserAttachmentStorageBytes(): number {
  const megabytes = parseNumberEnv("MAX_USER_ATTACHMENT_STORAGE_MB", 100, { min: 1, max: 10_000 });
  return Math.floor(megabytes * 1024 * 1024);
}

export function getEphemeralAttachmentTtlHours(): number {
  return parseNumberEnv("EPHEMERAL_ATTACHMENT_TTL_HOURS", 24, { min: 1, max: 24 * 30 });
}

export function validateProductionConfig(): { valid: boolean; issues: string[] } {
  const issues = missingEnvVars();

  for (const validate of [
    () => getAppUrl(),
    () => getAllowedModelIds(),
    () => getDefaultMonthlyBudgetUsd(),
    () => getMaxUserAttachmentStorageBytes(),
    () => getEphemeralAttachmentTtlHours()
  ]) {
    try {
      validate();
    } catch (error) {
      issues.push(error instanceof Error ? error.message : "Invalid production configuration.");
    }
  }

  validateSecureUrl("NEXT_PUBLIC_SUPABASE_URL", issues);
  validateSecureUrl("ERROR_WEBHOOK_URL", issues, true);

  const publishableKey = getOptionalEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (publishableKey && serviceRoleKey && publishableKey === serviceRoleKey) {
    issues.push("SUPABASE_SERVICE_ROLE_KEY must not equal the public Supabase key.");
  }

  const cronSecret = getOptionalEnv("CRON_SECRET");
  if (process.env.NODE_ENV === "production" && cronSecret && cronSecret.length < 32) {
    issues.push("CRON_SECRET must be at least 32 characters in production.");
  }

  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

function validateSecureUrl(name: string, issues: string[], optional = false): void {
  const value = getOptionalEnv(name);
  if (!value) {
    if (!optional) return;
    return;
  }

  try {
    const url = parseHttpUrl(name, value);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      issues.push(`${name} must use HTTPS in production.`);
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : `${name} is invalid.`);
  }
}

function parseHttpUrl(name: string, value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
    return url;
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL.`);
  }
}

function parseNumberEnv(
  name: string,
  fallback: number,
  range: { min: number; max: number }
): number {
  const value = getOptionalEnv(name);
  if (!value) {
    if (process.env.NODE_ENV === "production" && name === "DEFAULT_MONTHLY_BUDGET_USD") {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < range.min || parsed > range.max) {
    throw new Error(`${name} must be between ${range.min} and ${range.max}.`);
  }
  return parsed;
}
