import { expect, test } from "@playwright/test";
import { closeContexts, nav, onlineGuest, openAccount } from "./helpers";

test.afterEach(closeContexts);

const player = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  playerId: id,
  name,
  frame: null,
  rank: 1,
  ...extra,
});

test("monthly and activity rankings; a player's public profile", async ({ browser }) => {
  const page = await onlineGuest(browser, "Rita");
  // whole months of matches cannot be played here: the server's numbers come from its own tests
  await page.route("**/api/leaderboard?board=month*", (route) =>
    route.fulfill({
      json: {
        month: "2026-11",
        minMatches: 10,
        entries: [
          { ...player("p1", "Ann", { frame: "champion" }), gain: 37, matches: 14, rating: 1588 },
          { ...player("p2", "Ben"), gain: -12, matches: 11, rating: 1490 },
        ],
        previous: [{ ...player("p1", "Ann", { frame: "champion" }), gain: 52, matches: 20, rating: 1560 }],
      },
    }),
  );
  await page.route("**/api/leaderboard?board=active", (route) =>
    route.fulfill({
      json: { days: 30, perOpponentDay: 3, entries: [{ ...player("p2", "Ben"), matches: 23 }] },
    }),
  );
  await page.route("**/api/players/p1", (route) =>
    route.fulfill({
      json: {
        id: "p1",
        name: "Ann",
        frame: "champion",
        rank: 2,
        since: "2026-09",
        ratings: [{ variant: "backgammon", rating: 1588, matches: 40, wins: 25 }],
        recent: [],
        trophies: [{ month: "2026-10", variant: "backgammon", place: 1 }],
        showcase: ["online-win", "tournament-win"],
      },
    }),
  );

  await nav(page, "Online");
  await page.getByRole("tab", { name: "Rangliste", exact: true }).click();
  await page.getByRole("button", { name: "Monat", exact: true }).click();
  const ranking = page.getByTestId("ranking");
  await expect(ranking).toContainText("Ann");
  await expect(ranking).toContainText("+37");
  await expect(ranking).toContainText("-12");
  await expect(page.getByTestId("board-note")).toContainText("ab 10 Matches");
  await expect(page.getByTestId("month-podium")).toContainText("Ann");

  await ranking.getByRole("button", { name: /Ann/ }).click();
  const profile = page.getByTestId("player-profile");
  await expect(profile.getByTestId("frame-medallion")).toHaveAttribute("aria-label", "Monatssieger");
  await expect(profile.getByTestId("trophies")).toContainText("1. Platz Backgammon");
  await expect(profile.getByTestId("profile-showcase")).toContainText("Turniersieger");
  await expect(profile).toContainText("1588");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Aktiv", exact: true }).click();
  await expect(ranking).toContainText("Ben");
  await expect(ranking).toContainText("23");
  await expect(page.getByTestId("board-note")).toContainText("höchstens 3 pro Tag");
});

test("leaving the monthly and activity rankings is a setting", async ({ browser }) => {
  const page = await onlineGuest(browser, "Sven");
  await openAccount(page);
  await page.getByText(/Daten & Konto/).click();
  const toggle = page.getByRole("switch", { name: /Monats- und Aktivitätsrangliste/ });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await openAccount(page);
  await page.getByText(/Daten & Konto/).click();
  await expect(page.getByRole("switch", { name: /Monats- und Aktivitätsrangliste/ })).not.toBeChecked();
});
