/**
 * Operator details for the imprint and the privacy notice. A self-hosted server serves them as
 * /operator.json (from its environment, see deploy/Caddyfile); builds can also set them:
 *   VITE_OPERATOR_NAME     name of the person or organisation running the server
 *   VITE_OPERATOR_ADDRESS  postal address (lines separated by "|")
 *   VITE_OPERATOR_EMAIL    contact e-mail
 *   VITE_HOSTING           hosting provider of the server (named in the privacy notice)
 * Without them the pages say that the operator has not provided the information yet.
 */
const env = import.meta.env as Record<string, string | undefined>;

interface Operator {
  name: string | null;
  address: string[];
  email: string | null;
  hosting: string | null;
}

const fromStrings = (name?: string, address?: string, email?: string, hosting?: string): Operator => ({
  name: name?.trim() || null,
  address:
    address
      ?.split("|")
      .map((l) => l.trim())
      .filter(Boolean) ?? [],
  email: email?.trim() || null,
  hosting: hosting?.trim() || null,
});

/** Build-time values; replaced by the server's /operator.json once loaded (loadOperator). */
export const OPERATOR: Operator = fromStrings(
  env.VITE_OPERATOR_NAME,
  env.VITE_OPERATOR_ADDRESS,
  env.VITE_OPERATOR_EMAIL,
  env.VITE_HOSTING,
);

let loading: Promise<void> | null = null;

/** Fetches the operator details from the hosting server (once); keeps the build values without. */
export const loadOperator = (): Promise<void> => {
  loading ??= fetch("/operator.json", { cache: "no-cache" })
    .then((r) => (r.ok && r.headers.get("content-type")?.includes("json") ? r.json() : null))
    .then((j: Record<string, string> | null) => {
      if (j?.name?.trim()) Object.assign(OPERATOR, fromStrings(j.name, j.address, j.email, j.hosting));
    })
    .catch(() => {});
  return loading;
};

/** Source code of this app (AGPL-3.0: users of a hosted version must be able to get it). */
export const SOURCE_URL = env.VITE_SOURCE_URL?.trim() || "https://github.com/roqz/backgammon-tavli";

export type LegalPage = "imprint" | "privacy";
