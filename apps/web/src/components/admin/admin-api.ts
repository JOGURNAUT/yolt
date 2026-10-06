export type AdminResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; message: string };

const ERRORS: Record<string, string> = {
  REASON_REQUIRED: "Write a reason (at least 5 characters). It goes in the audit log.",
  NOT_DECIDABLE: "This report was already decided.",
  READ_ONLY_ROLE: "Your role is read-only. Ask an admin to make this change.",
  REAUTH_REQUIRED: "Sign in again to make admin changes.",
  SIGN_IN_REQUIRED: "Sign in again to make admin changes.",
  HANDLE_TAKEN: "That store handle is taken.",
  ALREADY_A_SELLER: "That phone number already has a store.",
  NO_CHANGE: "Nothing to change.",
  NOT_FOUND: "That no longer exists. Refresh the page.",
  NOTE_TOO_LONG: "The note is too long (1,000 characters at most).",
  OPEN_DUPLICATE_EXISTS: "Another open application already uses this phone number or Instagram handle.",
  STORE_NOT_APPROVED: "Only an approved store can be featured.",
  LISTINGS_NOT_LIVE: "One of the pieces is no longer live. Remove it and try again.",
  NOT_RETRYABLE: "Only a failed refund can be retried.",
};

const FIELDS: Record<string, string> = {
  sellerId: "store",
  title: "title (3 to 40 characters)",
  listingIds: "pieces (1 to 12)",
  window: "schedule (the end must be after the start)",
};

export function adminMessage(error?: string, details?: { field?: string }) {
  if (error === "INVALID" || error === "INVALID_REQUEST") {
    const f = details?.field;
    return f ? `Check the ${FIELDS[f] ?? f}.` : "Check the details and try again.";
  }
  return ERRORS[error ?? ""] ?? "Something went wrong. Try again.";
}

/** One call to the staff API. Never throws; the result carries the API's error code and a sentence for it. */
export async function adminRequest<T = unknown>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<AdminResult<T>> {
  try {
    const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { error?: string; details?: { field?: string } };
    if (res.ok) return { ok: true, data: data as T };
    return { ok: false, error: data.error ?? "ERROR", message: adminMessage(data.error, data.details) };
  } catch {
    return { ok: false, error: "NETWORK", message: "Couldn't reach YOLT. Check your connection and try again." };
  }
}

export const MIN_REASON = 5;
export const reasonOk = (reason: string) => reason.trim().length >= MIN_REASON;
