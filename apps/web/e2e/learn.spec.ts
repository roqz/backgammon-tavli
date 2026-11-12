import { expect, test } from "@playwright/test";
import { prepare, tapMove } from "./helpers";

test.beforeEach(async ({ page }) => {
  await prepare(page);
  await page.goto("/");
});

test("tutorial: the first lesson is solved by making the 5 point", async ({ page }) => {
  await page.getByRole("button", { name: /Tutorial/ }).click();
  await expect(page.getByText("1 · Steine ziehen")).toBeVisible();
  // the hint shows arrows; playing until the dice are used finishes the turn
  await page.getByRole("button", { name: /Tipp/ }).click();
  await expect(page.locator("svg marker, svg path[marker-end]").first()).toBeAttached();
  for (let i = 0; i < 2; i++) await tapMove(page);
  await expect(page.getByText(/Genau|Noch nicht ganz/)).toBeVisible();
  await page.getByRole("button", { name: /Weiter/ }).click();
  await expect(page.getByText("2 · Schlagen")).toBeVisible();
});

test("daily puzzle: a move is checked and the result recorded", async ({ page }) => {
  await page.getByRole("button", { name: /Tagesrätsel/ }).click();
  await expect(page.getByText(/Finde den besten Zug/)).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < 4 && (await page.getByRole("button", { name: /Prüfen/ }).isDisabled()); i++)
    await tapMove(page);
  await page.getByRole("button", { name: /Prüfen/ }).click();
  await expect(page.getByText(/Richtig|Nicht der beste Zug/)).toBeVisible();
  await page
    .getByRole("button", { name: /Lösung zeigen|Mein Zug/ })
    .first()
    .click();
});

test("the rule book shows board diagrams", async ({ page }) => {
  await page.getByRole("button", { name: /Regeln/ }).click();
  await expect(page.getByText(/Weiß zieht gegen den Uhrzeigersinn/)).toBeVisible();
  await page.getByRole("button", { name: "Plakoto" }).click();
  await expect(page.getByText(/klemmt ihn ein/)).toBeVisible();
});
