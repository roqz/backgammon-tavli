/**
 * Operator details for the imprint and the privacy notice, set at build time:
 *   VITE_OPERATOR_NAME     name of the person or organisation running the server
 *   VITE_OPERATOR_ADDRESS  postal address (lines separated by "|")
 *   VITE_OPERATOR_EMAIL    contact e-mail
 *   VITE_HOSTING           hosting provider of the server (named in the privacy notice)
 * Without them the pages say that the operator has not provided the information yet.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const OPERATOR = {
  name: env.VITE_OPERATOR_NAME?.trim() || null,
  address:
    env.VITE_OPERATOR_ADDRESS?.split("|")
      .map((l) => l.trim())
      .filter(Boolean) ?? [],
  email: env.VITE_OPERATOR_EMAIL?.trim() || null,
  hosting: env.VITE_HOSTING?.trim() || null,
} as const;

/** Source code of this app (AGPL-3.0: users of a hosted version must be able to get it). */
export const SOURCE_URL = env.VITE_SOURCE_URL?.trim() || "https://github.com/roqz/backgammon-tavli";

export type LegalPage = "imprint" | "privacy";
