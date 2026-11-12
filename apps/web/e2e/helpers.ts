import type { Browser, Page } from "@playwright/test";

export const SERVER_URL = "http://localhost:2580";

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

/** New browser context with a guest profile on the online screen. */
export const onlineGuest = async (browser: Browser, name: string): Promise<Page> => {
  const ctx = await browser.newContext({ locale: "de-DE" });
  const page = await ctx.newPage();
  await prepare(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Online spielen/ }).click();
  await page.getByLabel("Dein Spielername").fill(name);
  await page.getByRole("button", { name: "Profil anlegen" }).click();
  await page.getByText("Verbunden").waitFor();
  return page;
};
