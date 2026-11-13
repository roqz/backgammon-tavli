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
  await ann.getByRole("dialog").getByRole("button", { name: "1", exact: true }).first().click();
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

test("a correspondence league and a club tournament", async ({ browser }) => {
  test.setTimeout(120_000);
  const dora = await onlineGuest(browser, "Dora");
  const eli = await onlineGuest(browser, "Eli");
  const fay = await onlineGuest(browser, "Fay");
  const toTaverna = async (p: Page) => {
    await p.reload();
    await p.getByRole("button", { name: /Online spielen/ }).click();
    await openClubs(p);
    await p.getByRole("button", { name: /Taverna/ }).click();
  };

  await openClubs(dora);
  await dora
    .getByRole("button", { name: /Club gründen/ })
    .first()
    .click();
  await dora.getByRole("dialog").getByLabel("Name").fill("Taverna");
  await dora
    .getByRole("dialog")
    .getByRole("button", { name: /Club gründen/ })
    .click();
  await expect(dora.getByRole("heading", { name: /Taverna/ })).toBeVisible();
  for (const p of [eli, fay]) {
    await openClubs(p);
    await p.getByLabel("Clubs suchen …").fill("tave");
    await p.getByRole("button", { name: /Taverna/ }).click();
    await p.getByRole("button", { name: "Beitreten" }).click();
    await expect(p.getByText(/Mitglied/).first()).toBeVisible();
  }

  // a league played as correspondence games: all games start with the season
  await toTaverna(dora);
  await dora.getByRole("button", { name: /Liga anlegen/ }).click();
  const dialog = dora.getByRole("dialog");
  await dialog.getByRole("button", { name: "Fernpartien", exact: true }).click();
  await dialog.getByRole("button", { name: "1", exact: true }).first().click();
  await dialog.getByRole("button", { name: /Liga anlegen/ }).click();
  await dora.getByRole("button", { name: "Beitreten" }).click();
  for (const p of [eli, fay]) {
    await toTaverna(p);
    await p.getByRole("button", { name: /Saison 1/ }).click();
    await p.getByRole("button", { name: "Beitreten" }).click();
  }
  await toTaverna(dora);
  await dora.getByRole("button", { name: /Saison 1/ }).click();
  await dora.getByRole("button", { name: /Saison starten/ }).click();
  await expect(dora.getByTestId("league-table")).toBeVisible();
  await dora
    .getByRole("listitem")
    .filter({ hasText: "Eli" })
    .getByRole("button", { name: /Zur Partie/ })
    .click();
  await expect(dora.locator("svg").first()).toBeVisible();
  await expect(dora.getByText(/T\.\/Zug/)).toBeVisible();

  // a club tournament: created on the club page, members join it there
  await toTaverna(dora);
  await dora.getByRole("button", { name: /Club-Turnier anlegen/ }).click();
  await dora
    .getByRole("dialog")
    .getByRole("button", { name: /Turnier erstellen/ })
    .click();
  await expect(dora.getByText(/1\/8 Spieler|1 \/ 8/)).toBeVisible({ timeout: 10_000 });
  await toTaverna(eli);
  await eli
    .getByRole("listitem")
    .filter({ hasText: /Turnier von Dora/ })
    .getByRole("button", { name: "Beitreten" })
    .click();
  await eli.getByRole("tab", { name: "Turniere" }).click();
  await expect(eli.getByText("🏛 Taverna")).toBeVisible();
});

test("scheduled league: a fixed start time shows in the club's schedule", async ({ browser }) => {
  const eva = await onlineGuest(browser, "Eva");
  await openClubs(eva);
  await eva
    .getByRole("button", { name: /Club gründen/ })
    .first()
    .click();
  await eva.getByRole("dialog").getByLabel("Name").fill("Termin-Taverne");
  await eva
    .getByRole("dialog")
    .getByRole("button", { name: /Club gründen/ })
    .click();
  await expect(eva.getByRole("heading", { name: /Termin-Taverne/ })).toBeVisible();
  await eva.getByRole("button", { name: /Liga anlegen/ }).click();
  const dialog = eva.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Abendliga");
  await dialog.getByRole("switch", { name: /Fester Starttermin/ }).click();
  await expect(dialog.getByLabel("Fester Starttermin", { exact: true }).last()).toHaveValue(/T19:00$/);
  await dialog.getByRole("button", { name: /Liga anlegen/ }).click();
  await expect(eva.getByText(/Abendliga/).first()).toBeVisible();
  await eva.reload();
  await eva.getByRole("button", { name: /Online spielen/ }).click();
  await openClubs(eva);
  await eva.getByRole("button", { name: /Termin-Taverne/ }).click();
  const schedule = eva.getByTestId("club-schedule");
  await expect(schedule).toContainText("Abendliga");
  await expect(schedule).toContainText("19:00");
});

test("public league: enter next month's season from the leagues tab", async ({ browser }) => {
  const gus = await onlineGuest(browser, "Gus");
  await openClubs(gus);
  const card = gus.getByTestId("public-league");
  await expect(card).toContainText("Öffentliche Liga");
  await expect(card).toContainText(/Nächste Saison: Backgammon \d\d\/\d{4}/);
  await card.getByRole("button", { name: "Anmelden" }).click();
  await expect(card).toContainText("angemeldet");
  await card.getByRole("button", { name: "Abmelden" }).click();
  await expect(card.getByRole("button", { name: "Anmelden" })).toBeVisible();
});
