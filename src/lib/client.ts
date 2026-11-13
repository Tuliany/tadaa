"use client";

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "content-type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    // Full reload on purpose: clears any stale client state after a session ends.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

/**
 * Like api(), but for endpoints that stream newline-delimited JSON:
 * calls onPartial with each intermediate object and resolves with the final one.
 */
export async function apiStream<T, P = Record<string, unknown>>(
  url: string,
  init: RequestInit & { json?: unknown },
  onPartial: (p: P) => void,
): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { accept: "application/x-ndjson", ...(json !== undefined ? { "content-type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    // Full reload on purpose, as in api(): clears stale client state after a session ends.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (res.status === 401) window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as { partial?: P; done?: T; error?: string };
      if (msg.error) throw new Error(msg.error);
      if (msg.done !== undefined) return msg.done;
      if (msg.partial) onPartial(msg.partial);
    }
    if (done) break;
  }
  throw new Error("The connection closed before the answer was ready. Please try again.");
}
