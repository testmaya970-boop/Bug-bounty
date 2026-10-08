/** Reads at most `limit` bytes of a request body, counting the actual stream -- a missing
 * or false Content-Length can't get past it. Returns the RAW bytes (a signature check
 * must hash exactly what was sent, not a re-encoded string), or null if over the limit.
 * Without this, request.json() buffered and parsed an unauthenticated 50 MB body in full
 * before any schema rejected it (security review, app/api/client-errors). */
export async function readBodyWithin(request: Request, limit: number): Promise<Buffer | null> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) return null;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
