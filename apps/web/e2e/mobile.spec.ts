import { expect, test } from "@playwright/test";
import { prepare, tapMove } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("portrait phones get the rotated board and can move by tapping", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.getByRole("button", { name: "Mensch (gleiches Gerät)" }).click();
  await page.getByRole("button", { name: "Starten" }).click();
  const board = page.locator("svg").first();
  await expect(board).toBeVisible();
  const box = (await board.boundingBox())!;
  expect(box.height).toBeGreaterThan(box.width); // turned by 90°

  await expect(page.locator("svg circle[stroke-dasharray]").first()).toBeVisible();
  expect(await tapMove(page)).toBe(true);
  await expect(page.getByRole("button", { name: /Rückgängig/ })).toBeEnabled();
});
