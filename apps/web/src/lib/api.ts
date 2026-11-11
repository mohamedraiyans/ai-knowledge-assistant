import { cookies } from "next/headers";

/** The address the *browser* uses to reach the api (compiled into the client bundle). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * The address the Next.js *server* uses. Outside Docker it is the same as API_URL. Inside
 * Docker the browser reaches the api at localhost:4000 but the web container reaches it
 * at http://api:4000, so INTERNAL_API_URL overrides it there.
 */
export const SERVER_API_URL = process.env.INTERNAL_API_URL ?? API_URL;

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const cookieStore = await cookies();
  return fetch(`${SERVER_API_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Cookie: cookieStore.toString(),
    },
    cache: "no-store",
  });
}
