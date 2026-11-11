import { expect, test } from "@playwright/test";
import { onlineGuest, prepare, tapMove } from "./helpers";

test("two players: invite link, play, resign, verified dice, leaderboard", async ({ browser }) => {
  const alice = await onlineGuest(browser, "Alice");
  const bob = await onlineGuest(browser, "Bob");

  await alice.getByRole("button", { name: "1", exact: true }).click();
  await alice.getByRole("button", { name: /Freund einladen/ }).click();
  const code = ((await alice.locator("p.font-mono").textContent()) ?? "").trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  await bob.goto(`/?join=${code}`);
  await expect(alice.locator("svg").first()).toBeVisible();
  await expect(bob.locator("svg").first()).toBeVisible();

  // a few moves by whoever is to move
  for (let i = 0; i < 20 && (await alice.locator("ol li").count()) < 3; i++) {
    await tapMove(alice);
    await tapMove(bob);
    await alice.waitForTimeout(200);
  }
  await expect
    .poll(async () => JSON.stringify(await bob.locator("ol li").allInnerTexts()))
    .toBe(JSON.stringify(await alice.locator("ol li").allInnerTexts()));

  // quick messages
  await alice.getByRole("button", { name: "Kurznachricht" }).click();
  await alice.getByRole("button", { name: /Viel Glück/ }).click();
  await expect(bob.getByRole("status").filter({ hasText: /Alice:\s*🍀 Viel Glück!/ })).toBeVisible();

  await bob
    .getByRole("button", { name: /Aufgeben/ })
    .first()
    .click();
  await bob.getByRole("button", { name: /Sofort aufgeben/ }).click();
  await expect(alice.getByText(/Alice gewinnt das Match/)).toBeVisible();
  await expect(alice.getByText(/Würfel nachgeprüft/)).toBeVisible();
  await expect(bob.getByText(/Würfel nachgeprüft/)).toBeVisible();

  await alice.locator("[role=dialog]").getByRole("button", { name: /Menü/ }).click();
  await alice.getByRole("button", { name: /Online spielen/ }).click();
  await alice.getByRole("button", { name: "Rangliste", exact: true }).click();
  await expect(alice.getByText("Alice (du)")).toBeVisible();
});

test("a guest can secure an account and log in on a second device", async ({ browser }) => {
  const first = await onlineGuest(browser, "Carla");
  const username = `carla_${Date.now().toString(36)}`;
  await first.getByRole("button", { name: "Profil", exact: true }).click();
  await first.getByLabel("Benutzername").fill(username);
  await first.getByLabel("Passwort").fill("e2e-password");
  await first
    .getByRole("button", { name: /Konto sichern/ })
    .last()
    .click();
  await expect(first.getByText(`Konto: ${username}`)).toBeVisible();

  const ctx = await browser.newContext({ locale: "de-DE" });
  const second = await ctx.newPage();
  await prepare(second);
  await second.goto("/");
  await second.getByRole("button", { name: /Online spielen/ }).click();
  await second.getByRole("button", { name: "Anmelden" }).first().click();
  await second.getByLabel("Benutzername").fill(username.toUpperCase());
  await second.getByLabel("Passwort").fill("e2e-password");
  await second.locator("button", { hasText: "Anmelden" }).last().click();
  await expect(second.getByText("Verbunden")).toBeVisible();
  await expect(second.getByText("Carla")).toBeVisible();
});
