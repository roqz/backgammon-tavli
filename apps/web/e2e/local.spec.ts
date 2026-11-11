import { expect, test } from "@playwright/test";
import { checkerCount, prepare, tapMove } from "./helpers";

test.beforeEach(async ({ page }) => {
  await prepare(page);
  await page.goto("/");
});

test("plays against the computer, survives a reload and resumes", async ({ page }) => {
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.getByRole("button", { name: "Starten" }).click();
  await expect(page.locator("svg").first()).toBeVisible();

  // wait until it is our move (the computer may have won the opening roll); roll manually when
  // doubling is possible (auto-roll only rolls by itself when it is not)
  await expect
    .poll(
      async () => {
        const roll = page.getByRole("button", { name: /^Würfeln/ });
        if (await roll.isVisible()) await roll.click();
        return page.locator("svg circle[stroke-dasharray]").count();
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  expect(await tapMove(page)).toBe(true);
  await expect(page.getByRole("button", { name: /Zurück/ })).toBeEnabled();
  expect(await checkerCount(page)).toBe(30);

  await page.reload();
  await page.getByRole("button", { name: "Fortsetzen" }).click();
  await expect(page.locator("svg").first()).toBeVisible();
  expect(await checkerCount(page)).toBe(30);
});

test("opens settings and the rule book during a game", async ({ page }) => {
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.getByRole("button", { name: "Fevga", exact: true }).click();
  await page.getByRole("button", { name: "Starten" }).click();

  await page.getByRole("button", { name: "Regeln" }).click();
  await expect(page.getByRole("button", { name: "Fevga", pressed: true })).toBeVisible();
  await expect(page.getByText("Blockade-Verbot")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Einstellungen" }).click();
  await page.getByRole("button", { name: /Modern/ }).click();
  await page.keyboard.press("Escape");
  expect(await checkerCount(page)).toBe(30);
});

test("hotseat game can be resigned and replayed from the statistics", async ({ page }) => {
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.getByRole("button", { name: "Mensch (gleiches Gerät)" }).click();
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "Starten" }).click();
  await expect(page.locator("svg circle[stroke-dasharray]").first()).toBeVisible();
  await tapMove(page);

  await page
    .getByRole("button", { name: /Aufgeben/ })
    .first()
    .click();
  await page.locator("[role=dialog] button").first().click();
  await expect(page.getByText(/gewinnt das Match/)).toBeVisible();
  await page.getByRole("button", { name: /Partie ansehen/ }).click();
  await expect(page.locator("input[type=range]")).toBeVisible();
  expect(await checkerCount(page)).toBe(30);
});

test("imports an XGID position; the computer rejects a single but accepts a gammon", async ({ page }) => {
  // white (you) is still on the mid-point, black bears off its last two checkers next turn
  const xgid = `XGID=${"-".repeat(13)}O${"-".repeat(10)}b-:0:0:1:00:0:0:0:0:10`;
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.getByRole("button", { name: /Stellung importieren/ }).click();
  await page.getByLabel(/Stellung importieren/).fill(xgid);
  await page.getByRole("button", { name: "Starten" }).click();
  await expect(page.getByTestId("xgid")).toContainText(`${"-".repeat(13)}O${"-".repeat(10)}b-`);

  await page.getByRole("button", { name: /Aufgeben/ }).click();
  await page.getByRole("button", { name: /Aufgabe anbieten: Einfach/ }).click();
  await expect(page.getByText("Aufgabe abgelehnt")).toBeVisible();

  await page.getByRole("button", { name: /Aufgeben/ }).click();
  await page.getByRole("button", { name: /Aufgabe anbieten: Gammon/ }).click();
  await expect(page.getByText(/Gammon · \+2 Punkte/)).toBeVisible();
});

test("a mirrored board (home board left) can still be played by tapping", async ({ page }) => {
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.getByRole("button", { name: "Mensch (gleiches Gerät)" }).click();
  await page.getByRole("button", { name: "Starten" }).click();
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await page.getByRole("switch", { name: "Heimfeld links" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("svg circle[stroke-dasharray]").first()).toBeVisible();
  expect(await tapMove(page)).toBe(true);
  await expect(page.getByRole("button", { name: /Zurück/ })).toBeEnabled();
  expect(await checkerCount(page)).toBe(30);
});
