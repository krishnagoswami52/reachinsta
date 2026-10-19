/** apiRequest throws "<status>: <json body>" — extract the server's message field. */
export function errMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const raw = message.replace(/^\d+:\s*/, "");
  try {
    return JSON.parse(raw).message ?? raw;
  } catch {
    return raw;
  }
}
