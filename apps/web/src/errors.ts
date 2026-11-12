import type { Dict } from "./i18n";

/**
 * Server and network errors arrive as short English codes ("invite not found"); players see
 * them in their language. Unknown messages fall back to a generic text with the code.
 */
export const errorText = (t: Dict, message: string): string => {
  const known = (t.errors as Record<string, string>)[message];
  if (known) return known;
  if (/^failed to fetch|networkerror|load failed/i.test(message)) return t.errors.network;
  return `${t.errors.generic} (${message})`;
};

/** Error of a failed request or promise as player-facing text. */
export const errorOf = (t: Dict, e: unknown): string =>
  errorText(t, e instanceof Error ? e.message : String(e));
