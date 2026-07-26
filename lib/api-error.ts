export class ApiError extends Error {
  readonly status: number;
  readonly headers?: HeadersInit;

  constructor(status: number, message: string, headers?: HeadersInit) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.headers = headers;
  }
}
