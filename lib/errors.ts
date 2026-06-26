export function getErrorMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;

  if (error && typeof error === "object") {
    const details = error as {
      code?: unknown;
      details?: unknown;
      error?: unknown;
      hint?: unknown;
      message?: unknown;
      status?: unknown;
    };
    const message = typeof details.message === "string" ? details.message : undefined;
    const nestedError = typeof details.error === "string" ? details.error : undefined;
    const code = typeof details.code === "string" ? details.code : undefined;
    const status = typeof details.status === "number" ? details.status : undefined;
    const extraDetails = typeof details.details === "string" ? details.details : undefined;
    const hint = typeof details.hint === "string" ? details.hint : undefined;
    const parts = [
      message ?? nestedError,
      status ? `status ${status}` : undefined,
      code ? `code ${code}` : undefined,
      extraDetails,
      hint ? `Hint: ${hint}` : undefined
    ].filter(Boolean);

    if (parts.length) return parts.join(" ");
  }

  return fallback;
}

export function getErrorLog(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  if (error && typeof error === "object") {
    const details = error as {
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      message?: unknown;
      name?: unknown;
      status?: unknown;
    };

    return {
      name: typeof details.name === "string" ? details.name : undefined,
      message: typeof details.message === "string" ? details.message : getErrorMessage(error),
      status: typeof details.status === "number" ? details.status : undefined,
      code: typeof details.code === "string" ? details.code : undefined,
      details: typeof details.details === "string" ? details.details : undefined,
      hint: typeof details.hint === "string" ? details.hint : undefined
    };
  }

  return { message: getErrorMessage(error) };
}
