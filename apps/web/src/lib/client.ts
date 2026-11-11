export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface CallOptions extends Omit<RequestInit, "body"> {
  /** Sent as the JSON body. */
  json?: unknown;
}

/**
 * Browser-side call to the api. Sends the session cookie, parses the reply, and turns a
 * failed response into an Error carrying the server's own message (NestJS validation
 * errors arrive as a string or a list of strings), so a form can show exactly what to fix.
 */
export async function apiCall<T>(path: string, { json, headers, ...init }: CallOptions = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new Error(message ?? `Request failed (${res.status})`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
