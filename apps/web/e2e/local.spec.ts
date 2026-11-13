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
  await expect(page.getByRole("button", { name: /Rückgängig/ })).toBeEnabled();
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
  // the game can be analysed (the bot worker reviews every move)
  await page.getByRole("button", { name: /Partie analysieren/ }).click();
  await expect(page.getByTestId("review")).toBeVisible({ timeout: 30_000 });
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

  // No backgammon is possible any more (race, nothing in the computer's home board):
  // resigning without consent concedes a gammon.
  await page.getByRole("button", { name: /Aufgeben/ }).click();
  await expect(page.getByRole("button", { name: /Backgammon/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Sofort aufgeben: Gammon/ }).click();
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
  await expect(page.getByRole("button", { name: /Rückgängig/ })).toBeEnabled();
  expect(await checkerCount(page)).toBe(30);
});

test("settings opened from the menu return to the menu, even with a game running", async ({ page }) => {
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.getByRole("button", { name: "Starten" }).click();
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: /Einstellungen/ }).click();
  await page.getByRole("button", { name: "Zurück" }).click();
  await expect(page.getByRole("button", { name: "Fortsetzen" })).toBeVisible();
});

test("the browser Back button closes dialogs and returns to the previous screen", async ({ page }) => {
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.getByRole("button", { name: "Starten" }).click();
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toBeHidden();
  // still in the game
  await expect(page.getByRole("button", { name: "Menü" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Neues Spiel" })).toBeVisible();
});

test("imprint, privacy notice and source code are linked from the menu", async ({ page }) => {
  await page.getByRole("button", { name: "Datenschutz" }).click();
  await expect(page.getByRole("heading", { name: "Fair-Play-Auswertung" })).toBeVisible();
  await page.getByRole("button", { name: "Zurück" }).click();
  await page.getByRole("button", { name: "Impressum" }).click();
  await expect(page.getByRole("link", { name: /github\.com/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("link", { name: /Quellcode/ })).toBeVisible();
});

test("Tavla and Narde can be played against the computer", async ({ page }) => {
  test.setTimeout(120_000);
  for (const variant of ["Narde", "Tavla"]) {
    await page.goto("/");
    await page.getByRole("button", { name: "Neues Spiel" }).click();
    await page.getByRole("button", { name: variant, exact: true }).click();
    await page.getByRole("button", { name: "Starten" }).click();
    await expect(page.getByText(new RegExp(`${variant} · Spiel 1`))).toBeVisible();
    await expect
      .poll(
        async () => {
          const roll = page.getByRole("button", { name: /^Würfeln/ });
          if (await roll.isVisible()) await roll.click();
          return page.locator("svg circle[stroke-dasharray]").count();
        },
        { timeout: 45_000 },
      )
      .toBeGreaterThan(0);
    expect(await tapMove(page)).toBe(true);
    expect(await checkerCount(page)).toBe(30);
  }
});

test("money play with beavers: beaver a double, then raccoon", async ({ page }) => {
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.getByRole("button", { name: "Mensch (gleiches Gerät)" }).click();
  await page.getByRole("button", { name: "Unbegrenzt" }).click();
  await page.getByRole("switch", { name: /Beaver und Raccoon/ }).click();
  await page.getByRole("button", { name: "Starten" }).click();
  await expect(page.locator("svg circle[stroke-dasharray]").first()).toBeVisible();
  // finish the first turn (one or two moves, depending on the dice)
  const double = page.getByRole("button", { name: /Verdoppeln/ });
  for (let i = 0; i < 8 && !(await double.isVisible()); i++) {
    const end = page.getByRole("button", { name: "Zug beenden" });
    if ((await end.count()) > 0 && (await end.isEnabled())) await end.click();
    else await tapMove(page);
    await page.waitForTimeout(400);
  }
  await double.click();
  await page.getByRole("button", { name: /Beaver \(4\)/ }).click();
  await page.getByRole("button", { name: /Raccoon \(8\)/ }).click();
  await expect(page.getByRole("button", { name: /Raccoon/ })).toHaveCount(0);
  await expect(page.getByText(/Raccoon auf 8/).first()).toBeAttached();
});

test("settings sections fold; keyboard plays the main buttons; the local name is kept", async ({ page }) => {
  // settings: sections with navigation, countdown length, folding
  await page.getByRole("button", { name: /Einstellungen/ }).click();
  await page
    .getByRole("button", { name: /Dauer des Countdowns|1 s/ })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "1 s" }).click();
  await expect(page.getByRole("button", { name: "1 s" })).toHaveAttribute("aria-pressed", "true");
  const looks = page.getByRole("button", { name: /Designs & Skins/, expanded: true });
  await looks.click();
  await expect(page.getByRole("button", { name: /Designs & Skins/, expanded: false })).toBeVisible();
  await page.getByRole("switch", { name: /Automatisch würfeln/ }).click();
  await page.goBack();

  // the own name survives the next "new game"
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.getByLabel("Name").fill("Thea");
  await page.getByRole("button", { name: "Mensch (gleiches Gerät)" }).click();
  await expect(page.getByLabel("Weiß")).toHaveValue("Thea");
  await page.getByRole("button", { name: "Starten" }).click();

  // Space rolls the opening (ties roll again), then the first player is to move
  const status = page.getByText(/ist am Zug/).first();
  for (let i = 0; i < 6 && !(await status.isVisible()); i++) {
    await page.locator("body").press("Space");
    await page.waitForTimeout(500);
  }
  await expect(status).toBeVisible();
  // one move, U takes it back
  await expect(page.locator("svg circle[stroke-dasharray]").first()).toBeVisible();
  const before = await page.locator("svg [aria-label^='Punkt']").allInnerTexts();
  await tapMove(page);
  await expect(page.getByRole("button", { name: /Rückgängig/ })).toBeEnabled();
  await page.locator("body").press("u");
  await expect(page.getByRole("button", { name: /Rückgängig/ })).toBeDisabled();
  expect(before.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: /Menü/ }).first().click();
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Thea");
});
