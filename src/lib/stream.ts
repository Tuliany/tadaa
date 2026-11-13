/**
 * Newline-delimited JSON response for "show it as it's written" screens.
 * Lines: {"partial": {...}} while working, then {"done": {...}} or {"error": "..."}.
 */
export function ndjson(work: (send: (partial: unknown) => void) => Promise<unknown>) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const write = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        const done = await work((partial) => write({ partial }));
        write({ done });
      } catch (e) {
        console.error("[stream]", e);
        write({ error: (e as Error).message || "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}

export function wantsStream(req: Request) {
  return (req.headers.get("accept") ?? "").includes("application/x-ndjson");
}
