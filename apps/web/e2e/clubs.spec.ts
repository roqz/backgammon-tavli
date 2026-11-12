import { expect, type Page, test } from "@playwright/test";
import { onlineGuest } from "./helpers";

const openClubs = async (p: Page) => p.getByRole("tab", { name: "Clubs" }).click();

/** Fresh start on the clubs tab with the club opened. */
const toClub = async (p: Page) => {
  await p.reload();
  await p.getByRole("button", { name: /Online spielen/ }).click();
  await openClubs(p);
  await p.getByRole("button", { name: /Kafeneio/ }).click();
};

test("a club with a league: found, join, start a season and play a league match", async ({ browser }) => {
  test.setTimeout(120_000);
  const ann = await onlineGuest(browser, "Ann");
  const ben = await onlineGuest(browser, "Ben");
  const cid = await onlineGuest(browser, "Cid");

  await openClubs(ann);
  await ann
    .getByRole("button", { name: /Club gründen/ })
    .first()
    .click();
  await ann.getByRole("dialog").getByLabel("Name").fill("Kafeneio");
  await ann
    .getByRole("dialog")
    .getByRole("button", { name: /Club gründen/ })
    .click();
  await expect(ann.getByRole("heading", { name: /Kafeneio/ })).toBeVisible();

  for (const p of [ben, cid]) {
    await openClubs(p);
    await p.getByLabel("Clubs suchen …").fill("kafe");
    await p.getByRole("button", { name: /Kafeneio/ }).click();
    await p.getByRole("button", { name: "Beitreten" }).click();
    await expect(p.getByText(/Mitglied/).first()).toBeVisible();
  }

  await toClub(ann);
  await ann.getByRole("button", { name: /Liga anlegen/ }).click();
  await ann.getByRole("dialog").getByRole("button", { name: "1", exact: true }).click();
  await ann
    .getByRole("dialog")
    .getByRole("button", { name: /Liga anlegen/ })
    .click();
  await ann.getByRole("button", { name: "Beitreten" }).click();

  for (const p of [ben, cid]) {
    await toClub(p);
    await p.getByRole("button", { name: /Saison 1/ }).click();
    await p.getByRole("button", { name: "Beitreten" }).click();
  }
  await toClub(ann);
  await ann.getByRole("button", { name: /Saison 1/ }).click();
  await ann.getByRole("button", { name: /Saison starten/ }).click();
  await expect(ann.getByTestId("league-table")).toBeVisible();

  // Ann challenges Ben from her league matches; Ben accepts and both play
  await ann
    .getByRole("listitem")
    .filter({ hasText: "Ben" })
    .getByRole("button", { name: /Herausfordern/ })
    .click();
  await expect(ben.getByText(/Ann fordert dich heraus/)).toBeVisible({ timeout: 15_000 });
  await ben.getByRole("button", { name: "Annehmen" }).click();
  await expect(ann.getByText(/Backgammon · Spiel 1/)).toBeVisible({ timeout: 15_000 });
});
