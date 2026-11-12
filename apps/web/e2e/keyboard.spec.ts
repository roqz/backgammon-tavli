import { expect, type Page, test } from "@playwright/test";
import { checkerCount, prepare } from "./helpers";

/** Accessible name of the focused element (a board cell while playing by keyboard). */
const focusedLabel = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");

/** Tabs from the top of the page into the board; the roving tabindex makes it a single stop. */
const tabIntoBoard = async (page: Page) => {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement?.hasAttribute("data-cell"))) return;
  }
  throw new Error("board not reachable with Tab");
};

/** Walks both rows of the board with the arrow keys until a cell is announced as a legal target. */
const focusFirstTarget = async (page: Page) => {
  for (const row of ["ArrowUp", "ArrowDown"]) {
    await page.keyboard.press(row);
    await page.keyboard.press("Home");
    for (let col = 0; col < 14; col++) {
      if ((await focusedLabel(page)).includes("Ziel möglich")) return;
      await page.keyboard.press("ArrowRight");
    }
  }
  throw new Error("no legal target found");
};

test("a move can be played with the keyboard only", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.getByRole("button", { name: "Mensch (gleiches Gerät)" }).click();
  await page.getByRole("button", { name: "Starten" }).click();
  await expect(page.getByRole("application", { name: "Spielbrett" })).toBeVisible();
  await expect(page.locator("svg circle[stroke-dasharray]").first()).toBeVisible();

  // Tab lands on a checker that can move.
  await tabIntoBoard(page);
  expect(await focusedLabel(page)).toMatch(/^(Punkt \d+|Bar): .*ziehbar/);

  // Enter picks it up, Escape puts it back.
  const live = page.getByTestId("board-live");
  await page.keyboard.press("Enter");
  await expect(page.locator("svg [data-target]").first()).toBeVisible();
  await expect(live).toContainText("ausgewählt");
  await page.keyboard.press("Escape");
  await expect(page.locator("svg [data-target]")).toHaveCount(0);
  await expect(live).toContainText("Auswahl aufgehoben");

  // Pick it up again and move it onto the first legal target.
  await page.keyboard.press("Enter");
  await expect(page.locator("svg [data-target]").first()).toBeVisible();
  await focusFirstTarget(page);
  await page.keyboard.press("Enter");
  await expect(live).toContainText(/Letzter Zug (Weiß|Schwarz): \S*\d+\/\d+/);
  expect(await checkerCount(page)).toBe(30);

  // S reads out the position on demand.
  await page.keyboard.press("s");
  await expect(live).toContainText(/Pips: Weiß \d+, Schwarz \d+/);
});
