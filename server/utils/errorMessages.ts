/**
 * Two-layer error handling for fetch failures.
 *
 *   fetch_runs.error_message       — user-facing copy, safe to render
 *   fetch_runs.internal_error_code — developer classification, never rendered
 *
 * Nothing technical may reach the first column. Raw Apify text ("insufficient
 * credit"), our own recovery bookkeeping ("worker went away 50724m ago"),
 * driver errors (ECONNREFUSED) and stack traces are all either operational
 * detail the user cannot act on, or actively alarming — a recovered job is a
 * success from where the user sits, and should say nothing at all.
 *
 * Every write to fetch_runs.error_message goes through handleError().
 */

/**
 * A `null` translation means "show the user nothing". That is a real outcome,
 * not a missing entry: some internal states have no user-facing consequence.
 */
const ERROR_TRANSLATIONS: Record<string, string | null> = {
  // Apify / key pool
  APIFY_KEY_EXHAUSTED:
    "We're experiencing high demand right now. Please try again in a few minutes.",
  APIFY_ALL_KEYS_EXHAUSTED:
    "Our systems are running at full capacity. Please try again shortly.",
  APIFY_TIMEOUT:
    "Your fetch took longer than expected, so we stopped it. Your fetch credit has been refunded — please try again.",
  APIFY_RATE_LIMITED: "Too many requests right now. Please wait a moment and try again.",
  APIFY_BLOCKED:
    "We couldn't reach some competitor data because Instagram limited the request. Please try again.",

  // Recovery / system
  JOB_RECOVERED: null, // A recovered job is a success in progress. Say nothing.
  JOB_RETRYING: null, // Still queued and still going to run. Say nothing.
  FETCH_CANCELLED: "You stopped this fetch.",
  WORKER_TIMEOUT: "Your fetch is taking longer than usual. Please check back in a minute.",

  // Instagram
  INSTAGRAM_PRIVATE_ACCOUNT:
    "One or more competitor accounts are private, so we couldn't read their reels.",
  INSTAGRAM_NOT_FOUND: "One or more competitor usernames no longer exist on Instagram.",
  INSTAGRAM_NO_REELS: "No reels were posted by these competitors in the selected time range.",

  // Infrastructure
  NETWORK_ERROR: "Connection issue on our side. Please try again in a moment.",
  DATABASE_ERROR: "A temporary issue occurred. Please try again in a moment.",

  // Plan / quota
  FETCH_LIMIT_REACHED:
    "You've used all your fetches for this month. Upgrade your plan or wait for your next reset.",
  COMPETITOR_LIMIT_REACHED:
    "You've reached your competitor limit. Upgrade your plan to track more.",
  NO_COMPETITORS: "Add at least one competitor before running a fetch.",

  UNKNOWN_ERROR: "Something went wrong. Please try again, or contact support if it keeps happening.",
};

export type ErrorCode = keyof typeof ERROR_TRANSLATIONS;

/** Pull every string an error might be hiding its cause in. */
function errorText(error: any): string {
  if (!error) return "";
  if (typeof error === "string") return error.toLowerCase();
  return [
    error.message,
    error.error?.message,
    error.response?.data?.error?.message,
    error.response?.data?.message,
    error.cause?.message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Classify a raw error into an internal code.
 *
 * Order matters. Typed errors are checked before text, because a message can
 * contain a word that a broader pattern would also match — a timeout message
 * mentioning "limit" must not be read as a budget failure.
 */
export function detectErrorCode(error: any): ErrorCode {
  if (!error) return "UNKNOWN_ERROR";

  // Typed first: this is the one signal that cannot be a coincidence.
  if (error?.name === "FetchTimeoutError") return "APIFY_TIMEOUT";

  const text = errorText(error);
  if (!text) return "UNKNOWN_ERROR";

  const statusCode = error?.statusCode ?? error?.status ?? error?.response?.status;
  if (statusCode === 402) return "APIFY_KEY_EXHAUSTED";
  if (statusCode === 429) return "APIFY_RATE_LIMITED";

  // Our own bookkeeping, before anything else can claim it.
  if (text.includes("recovering") || text.includes("worker went away")) return "JOB_RECOVERED";
  if (text.includes("cancelled by user") || text.includes("canceled by user")) {
    return "FETCH_CANCELLED";
  }

  if (text.includes("all apify keys exhausted") || text.includes("no apify key")) {
    return "APIFY_ALL_KEYS_EXHAUSTED";
  }

  // Deliberately full phrases, not loose substrings. The looser matching in
  // keyManager.isBudgetError has retired healthy keys (audit H3); repeating
  // that mistake here would show a "high demand" message for unrelated faults.
  if (
    text.includes("insufficient credit") ||
    text.includes("insufficient platform credit") ||
    text.includes("budget exceeded") ||
    text.includes("quota exhausted") ||
    text.includes("no credit remaining") ||
    text.includes("monthly usage limit reached") ||
    text.includes("monthly usage hard limit") ||
    text.includes("payment required")
  ) {
    return "APIFY_KEY_EXHAUSTED";
  }

  if (text.includes("rate limit") || text.includes("too many requests")) return "APIFY_RATE_LIMITED";
  if (text.includes("timed out") || text.includes("timeout")) return "APIFY_TIMEOUT";
  if (text.includes("blocked") || text.includes("challenge_required")) return "APIFY_BLOCKED";
  if (text.includes("private account") || text.includes("is private")) {
    return "INSTAGRAM_PRIVATE_ACCOUNT";
  }
  if (text.includes("user does not exist") || text.includes("user not found")) {
    return "INSTAGRAM_NOT_FOUND";
  }
  if (text.includes("no competitors")) return "NO_COMPETITORS";
  if (
    text.includes("econnrefused") ||
    text.includes("econnreset") ||
    text.includes("etimedout") ||
    text.includes("enotfound") ||
    text.includes("socket hang up")
  ) {
    return "NETWORK_ERROR";
  }
  if (
    text.includes("relation ") ||
    text.includes("violates ") ||
    text.includes("postgres") ||
    text.includes("numeric field overflow")
  ) {
    return "DATABASE_ERROR";
  }

  return "UNKNOWN_ERROR";
}

/**
 * User-facing copy for an error, or null when the user should see nothing.
 *
 * Note the difference between a code mapped to null and a code that is
 * missing: the first is intentional silence, the second falls back to the
 * generic message.
 */
export function getUserFriendlyError(error: any): string | null {
  const code = detectErrorCode(error);
  if (code in ERROR_TRANSLATIONS) return ERROR_TRANSLATIONS[code];
  return ERROR_TRANSLATIONS.UNKNOWN_ERROR;
}

export function messageForCode(code: ErrorCode): string | null {
  if (code in ERROR_TRANSLATIONS) return ERROR_TRANSLATIONS[code];
  return ERROR_TRANSLATIONS.UNKNOWN_ERROR;
}

export interface HandledError {
  /** Safe to store in fetch_runs.error_message and render. null = show nothing. */
  userMessage: string | null;
  /** Goes in fetch_runs.internal_error_code. Never rendered to end users. */
  internalCode: ErrorCode;
}

/**
 * Log the technical detail for us, return the safe pair for the database.
 * The full message and stack stay in the server log and in jobs.last_error;
 * only the translated half is ever persisted where a user can read it.
 */
export function handleError(error: any, context: string): HandledError {
  const internalCode = detectErrorCode(error);
  const userMessage = messageForCode(internalCode);

  console.error(`[${context}] ${internalCode}:`, {
    message: error?.message ?? String(error),
    name: error?.name,
    statusCode: error?.statusCode ?? error?.status,
    stack: error?.stack,
  });

  return { userMessage, internalCode };
}
