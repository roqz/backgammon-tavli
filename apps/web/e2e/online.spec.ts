import { expect, test } from "@playwright/test";
import { closeContexts, nav, newGame, onlineGuest, openAccount, prepare, tapMove, track } from "./helpers";

test.afterEach(closeContexts);

test("two players: invite link, play, resign, verified dice, leaderboard", async ({ browser }) => {
  const alice = await onlineGuest(browser, "Alice");
  const bob = await onlineGuest(browser, "Bob");

  await newGame(alice, "Online-Gegner");
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
  await expect(bob.getByRole("status").filter({ hasText: /Alice:\s*Viel Glück!/ })).toBeVisible();

  await bob
    .getByRole("button", { name: /Aufgeben/ })
    .first()
    .click();
  await bob.getByRole("button", { name: /Sofort aufgeben/ }).click();
  await expect(alice.getByText(/Alice gewinnt das Match/)).toBeVisible();
  await expect(alice.getByText(/Würfel nachgeprüft/)).toBeVisible();
  await expect(bob.getByText(/Würfel nachgeprüft/)).toBeVisible();

  await alice.locator("[role=dialog]").getByRole("button", { name: /Menü/ }).click();
  await nav(alice, "Online");
  await alice.getByRole("tab", { name: "Rangliste", exact: true }).click();
  await expect(alice.getByText("Alice (du)")).toBeVisible();
});

test("a player who loses the connection comes back into the running match", async ({ browser }) => {
  const alice = await onlineGuest(browser, "Alma");
  const bob = await onlineGuest(browser, "Bruno");
  await newGame(alice, "Online-Gegner");
  await alice.getByRole("button", { name: "1", exact: true }).click();
  await alice.getByRole("button", { name: /Freund einladen/ }).click();
  const code = ((await alice.locator("p.font-mono").textContent()) ?? "").trim();
  await bob.goto(`/?join=${code}`);
  await expect(bob.locator("svg").first()).toBeVisible();

  // network gone (e.g. a tunnel, or the phone switching networks)
  await bob.context().setOffline(true);
  await expect(bob.getByText(/Verbindung unterbrochen/).first()).toBeVisible();
  await expect(alice.getByText(/Gegner getrennt/)).toBeVisible();
  await bob.waitForTimeout(1_500);
  await bob.context().setOffline(false);
  await expect(bob.getByText(/Verbindung unterbrochen/)).toHaveCount(0);
  await expect(alice.getByText(/Gegner getrennt/)).toHaveCount(0);

  // and the match simply goes on
  for (let i = 0; i < 20 && (await alice.locator("ol li").count()) < 2; i++) {
    await tapMove(alice);
    await tapMove(bob);
    await alice.waitForTimeout(200);
  }
  await expect
    .poll(async () => JSON.stringify(await bob.locator("ol li").allInnerTexts()))
    .toBe(JSON.stringify(await alice.locator("ol li").allInnerTexts()));
  expect(await alice.locator("ol li").count()).toBeGreaterThanOrEqual(2);
});

test("on a phone held sideways the quick messages stay on screen", async ({ browser }) => {
  const alice = await onlineGuest(browser, "Ines");
  const bob = await onlineGuest(browser, "Jonas", {
    viewport: { width: 852, height: 393 },
    isMobile: true,
    hasTouch: true,
  });
  await newGame(alice, "Online-Gegner");
  await alice.getByRole("button", { name: "1", exact: true }).click();
  await alice.getByRole("button", { name: /Freund einladen/ }).click();
  const code = ((await alice.locator("p.font-mono").textContent()) ?? "").trim();
  await bob.goto(`/?join=${code}`);
  await expect(bob.getByTestId("phone-board")).toBeVisible();
  await bob.getByRole("button", { name: "Kurznachricht" }).click();
  const picker = bob.getByTestId("emote-picker");
  await expect(picker).toBeInViewport({ ratio: 1 });
  await picker.getByRole("button").last().click();
  await expect(alice.getByRole("status").filter({ hasText: /Jonas:/ })).toBeVisible();
});

test("a guest can secure an account and log in on a second device", async ({ browser }) => {
  const first = await onlineGuest(browser, "Carla");
  const username = `carla_${Date.now().toString(36)}`;
  await openAccount(first);
  await first.getByLabel("Benutzername").fill(username);
  await first.getByLabel("Passwort").fill("e2e-password");
  await first
    .getByRole("button", { name: /Konto sichern/ })
    .last()
    .click();
  await expect(first.getByText(`Konto: ${username}`)).toBeVisible();

  const ctx = track(await browser.newContext({ locale: "de-DE" }));
  const second = await ctx.newPage();
  await prepare(second);
  await second.goto("/");
  await nav(second, "Online");
  await second.getByRole("button", { name: "Anmelden" }).first().click();
  await second.getByLabel("Benutzername").fill(username.toUpperCase());
  await second.getByLabel("Passwort").fill("e2e-password");
  await second.locator("button", { hasText: "Anmelden" }).last().click();
  await expect(second.getByText("Verbunden")).toBeVisible();
  await nav(second, "Profil");
  await expect(second.getByRole("heading", { name: "Carla" })).toBeVisible();
});

test("a guest can export their data and delete the profile", async ({ browser }) => {
  const page = await onlineGuest(browser, "Zoe");
  await openAccount(page);
  await page.getByText(/Daten & Konto/).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Meine Daten herunterladen/ }).click();
  expect((await download).suggestedFilename()).toBe("tavli-data.json");
  await page.getByRole("button", { name: /Profil löschen/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Profil löschen/ })
    .click();
  // back to the start: a new profile can be created
  await expect(page.getByRole("button", { name: "Profil anlegen" })).toBeVisible();
});
