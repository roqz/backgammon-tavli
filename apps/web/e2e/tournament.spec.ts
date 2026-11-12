import { expect, type Page, test } from "@playwright/test";
import { onlineGuest } from "./helpers";

test("four players fill a tournament; first-round matches start and lead back to the bracket", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const names = ["Ana", "Bea", "Cem", "Dov"];
  const pages: Page[] = [];
  for (const n of names) pages.push(await onlineGuest(browser, n));
  const [host, ...others] = pages;

  await host!.getByRole("tab", { name: "Turniere", exact: true }).click();
  await host!.getByRole("button", { name: /Turnier erstellen/ }).click();
  await host!.getByLabel("Name").fill("Pokal");
  await host!.getByRole("button", { name: "4", exact: true }).click();
  await host!.getByRole("button", { name: "1", exact: true }).click();
  await host!
    .getByRole("button", { name: /Turnier erstellen/ })
    .last()
    .click();
  await expect(host!.getByText("Pokal")).toBeVisible();

  for (const p of others) {
    await p.getByRole("tab", { name: "Turniere", exact: true }).click();
    await p.getByRole("button", { name: "Beitreten" }).click();
  }

  // the bracket starts (after a short pause) and every player is taken to the board
  for (const p of pages) {
    await expect(p.getByText(/🏆 Pokal · Halbfinale/)).toBeVisible({ timeout: 30_000 });
  }

  // in each match one player resigns; the winners see the way back to the bracket
  const resigners: { page: Page; opponent: string | undefined }[] = [];
  for (const p of pages) {
    const resign = p.getByRole("button", { name: /Aufgeben/ }).first();
    if (resigners.length < 2 && (await resign.isVisible())) {
      // only one player per match resigns: pair pages by the opponent name shown in the score panel
      const opponentResigned = resigners.some((r) => r.opponent === names[pages.indexOf(p)]);
      if (opponentResigned) continue;
      const scoreNames = await p.locator("aside span.truncate").allInnerTexts();
      const opponent = scoreNames.find((n) => n !== names[pages.indexOf(p)]);
      resigners.push({ page: p, opponent });
      await resign.click();
      await p.getByRole("button", { name: /Sofort aufgeben/ }).click();
    }
  }
  expect(resigners).toHaveLength(2);
  const winner = pages.find((p) => !resigners.some((r) => r.page === p))!;
  await expect(winner.getByRole("button", { name: /Zum Turnier/ })).toBeVisible({ timeout: 15_000 });
  await winner.getByRole("button", { name: /Zum Turnier/ }).click();
  await expect(winner.getByText("Halbfinale")).toBeVisible();
  await expect(winner.getByText("Finale", { exact: true })).toBeVisible();
});
