import type { Browser, BrowserContext, Page } from "@playwright/test";

export const SERVER_URL = "http://127.0.0.1:2580";

/** Deterministic, fast settings: German UI, no 3D dice, no sounds, no countdowns. */
const SETTINGS = {
  state: {
    style: "classic",
    lang: "de",
    showPips: true,
    showNumbers: true,
    autoRoll: true,
    autoRollCountdown: false,
    autoConfirm: true,
    autoConfirmDelay: false,
    sound: false,
    dice3d: false,
  },
  version: 1,
};

/** Applies the test settings (and the e2e game server) before the app starts. */
export const prepare = async (page: Page) => {
  await page.addInitScript(
    ([settings, server]) => {
      if (sessionStorage.getItem("e2e-init")) return;
      sessionStorage.setItem("e2e-init", "1");
      localStorage.clear();
      localStorage.setItem("tavli.settings", settings);
      localStorage.setItem("tavli.online", JSON.stringify({ state: { serverUrl: server }, version: 1 }));
    },
    [JSON.stringify(SETTINGS), SERVER_URL] as const,
  );
};

/** Number of checkers drawn on the board. */
export const checkerCount = (page: Page) =>
  page.evaluate(() => document.querySelectorAll("svg g[filter]").length);

/** Plays one single move by tapping a highlighted checker and then its first target. */
export const tapMove = async (page: Page): Promise<boolean> => {
  const src = page.locator("svg circle[stroke-dasharray]").first();
  if (!(await src.count())) return false;
  await src.click({ force: true });
  const tgt = page.locator("svg [data-target]").first();
  if (!(await tgt.count())) return false;
  const box = (await tgt.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return true;
};

/** Goes to one of the four main destinations. */
export const nav = (page: Page, name: "Start" | "Offline" | "Online" | "Profil") =>
  page
    .getByRole("navigation", { name: "Hauptnavigation" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();

/** Opens the setup of a new game: local games under "Offline", the others under "Online". */
export const newGame = async (
  page: Page,
  mode: "Computer" | "Zu zweit" | "Online-Gegner" | "Fernpartie" = "Computer",
) => {
  await nav(page, mode === "Computer" || mode === "Zu zweit" ? "Offline" : "Online");
  const card = {
    Computer: /^Gegen Computer/,
    "Zu zweit": /^Zu zweit/,
    "Online-Gegner": /^Live-Match/,
    Fernpartie: /^Fernpartie(?!n)/,
  }[mode];
  await page.getByRole("button", { name: card }).click();
};

/** The online account page (profile → account & data). */
export const openAccount = async (page: Page) => {
  await nav(page, "Profil");
  await page.getByRole("button", { name: /Konto & Daten/ }).click();
};

/**
 * Browser contexts a test opens itself (the browser fixture outlives the test). Closed after each
 * test: open pages keep their WebSocket, and the server allows only 20 per network.
 */
const opened: BrowserContext[] = [];
export const track = <T extends BrowserContext>(ctx: T): T => {
  opened.push(ctx);
  return ctx;
};
export const closeContexts = async () => {
  await Promise.all(opened.splice(0).map((c) => c.close().catch(() => {})));
};

/** New browser context with a guest profile on the online screen. */
export const onlineGuest = async (
  browser: Browser,
  name: string,
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<Page> => {
  const ctx = track(await browser.newContext({ locale: "de-DE", ...options }));
  const page = await ctx.newPage();
  await prepare(page);
  await page.goto("/");
  await nav(page, "Online");
  await page.getByLabel("Dein Spielername").fill(name);
  await page.getByRole("button", { name: "Profil anlegen" }).click();
  // fails fast with the page in the trace (e.g. a rate limit) instead of waiting for the test timeout
  await page.getByText("Verbunden").waitFor({ timeout: 20_000 });
  return page;
};
