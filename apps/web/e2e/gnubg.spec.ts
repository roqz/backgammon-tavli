import { expect, test } from "@playwright/test";
import { onlineGuest, prepare } from "./helpers";

test("imports a GNU Backgammon ID; both IDs are shown for the position", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.getByRole("button", { name: /Stellung importieren/ }).click();
  await page.getByLabel(/Stellung importieren/).fill("4HPwATDgc/ABMA:cAkAAAAAAAAA");
  await page.getByRole("button", { name: "Starten" }).click();
  await expect(page.getByTestId("gnubgid")).toContainText("4HPwATDgc/ABMA:");
  await expect(page.getByTestId("xgid")).toContainText("XGID=-b----E-C---eE---c-e----B-");
});

test("opens a .mat file from the statistics in the replay", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Statistik/ }).click();
  const mat = [
    " 3 point match",
    "",
    " Game 1",
    " Alice : 0                          Bob : 0",
    "  1) 31: 8/5 6/5                     65: 24/13",
    "  2) 44: 24/20(2) 13/9(2)             Doubles => 2",
    "  3)  Drops",
    "",
    "                                       Wins 1 point",
  ].join("\n");
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "game.mat", mimeType: "text/plain", buffer: Buffer.from(mat) });
  await expect(page.locator("input[type=range]")).toBeVisible();
  await expect(page.getByText(/Bob gewinnt|Bob wins/)).toBeVisible();
});

test("money session: games go on until a player ends the session", async ({ browser }) => {
  test.setTimeout(90_000);
  const ann = await onlineGuest(browser, "Ann");
  const ben = await onlineGuest(browser, "Ben");
  for (const p of [ann, ben]) {
    await p.getByRole("button", { name: /Geld/ }).click();
    await expect(p.getByText(/Spiel um Spiel/)).toBeVisible();
    await p.getByRole("button", { name: /Gegner suchen/ }).click();
  }
  await expect(ann.getByText(/Geldspiel/).first()).toBeVisible({ timeout: 15_000 });
  await ben
    .getByRole("button", { name: /Aufgeben/ })
    .first()
    .click();
  await ben.getByRole("button", { name: /Session beenden/ }).click();
  await ben
    .getByRole("dialog")
    .getByRole("button", { name: /Session beenden/ })
    .click();
  await expect(ann.getByText(/Session beendet/)).toBeVisible({ timeout: 15_000 });
});
