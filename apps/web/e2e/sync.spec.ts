import { expect, test } from "@playwright/test";
import { closeContexts, nav, newGame, onlineGuest, openAccount, prepare, tapMove, track } from "./helpers";

test.afterEach(closeContexts);

test("games with their replays and the chosen looks follow the account to another device", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const first = await onlineGuest(browser, "Mara");
  // a game on one device (hotseat), and a board chosen there
  await newGame(first, "Zu zweit");
  await first.getByRole("button", { name: "1", exact: true }).click();
  await first.getByRole("button", { name: "Starten" }).click();
  await expect(first.locator("svg circle[stroke-dasharray]").first()).toBeVisible();
  await tapMove(first);
  await first
    .getByRole("button", { name: /Aufgeben/ })
    .first()
    .click();
  await first.locator("[role=dialog] button").first().click();
  await expect(first.getByText(/gewinnt das Match/)).toBeVisible();
  await first.getByRole("dialog").getByRole("button", { name: "Menü" }).click();
  await nav(first, "Profil");
  await first.getByRole("button", { name: /Brett & Würfel/ }).click();
  await first.getByRole("button", { name: /^Modern/ }).click();

  const username = `mara_${Date.now().toString(36)}`;
  await openAccount(first);
  await first.getByLabel("Benutzername").fill(username);
  await first.getByLabel("Passwort").fill("e2e-password");
  await first
    .getByRole("button", { name: /Konto sichern/ })
    .last()
    .click();
  await expect(first.getByText(`Konto: ${username}`)).toBeVisible();

  // the other device: log in and find both
  const ctx = track(await browser.newContext({ locale: "de-DE" }));
  const second = await ctx.newPage();
  await prepare(second);
  await second.goto("/");
  await nav(second, "Online");
  await second.getByRole("button", { name: "Anmelden" }).first().click();
  await second.getByLabel("Benutzername").fill(username);
  await second.getByLabel("Passwort").fill("e2e-password");
  await second.locator("button", { hasText: "Anmelden" }).last().click();
  await expect(second.getByText("Verbunden")).toBeVisible();

  await nav(second, "Profil");
  await second.getByRole("button", { name: /Statistik & Partien/ }).click();
  await expect(second.getByText("Letzte Partien")).toBeVisible({ timeout: 15_000 });
  await second
    .getByRole("listitem")
    .filter({ hasText: /Weiß|Schwarz/ })
    .first()
    .getByRole("button", { name: /Ansehen/ })
    .click();
  await expect(second.locator("input[type=range]")).toBeVisible();

  await nav(second, "Profil");
  await second.getByRole("button", { name: /Brett & Würfel/ }).click();
  await expect(second.getByRole("button", { name: /^Modern/ })).toHaveAttribute("aria-pressed", "true");
});
