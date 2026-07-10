import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "@/lib/api-error";
import { getErrorLog } from "@/lib/errors";

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const requestId = crypto.randomUUID();
  if (process.env.NODE_ENV !== "test") {
    console.error("[api] unhandled request error", { requestId, ...getErrorLog(error) });
  }
  return NextResponse.json(
    { error: "The request could not be completed.", requestId },
    { status: 500 }
  );
}

type RouteHandler<Args extends unknown[]> = (...args: Args) => Response | Promise<Response>;

export function apiRoute<Args extends unknown[]>(handler: RouteHandler<Args>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return jsonError(error);
    }
  };
}
