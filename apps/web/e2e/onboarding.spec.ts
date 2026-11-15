import { expect, test } from "@playwright/test";
import { onlineGuest, SERVER_URL } from "./helpers";

/** A browser that has never been here: no settings, no welcome seen. */
const fresh = { storageState: { cookies: [], origins: [] } };

test("first start: welcome, language, then straight into the tutorial; not shown again", async ({
  browser,
}) => {
  const page = await (await browser.newContext(fresh)).newPage();
  await page.goto("/");
  const welcome = page.getByRole("dialog", { name: /Willkommen|Welcome/ });
  await expect(welcome).toBeVisible();
  await welcome.getByRole("button", { name: "English" }).click();
  await expect(welcome.getByRole("heading", { name: "Welcome!" })).toBeVisible();
  await welcome.getByRole("button", { name: "Deutsch" }).click();
  await welcome.getByRole("button", { name: "Los geht's" }).click();
  await welcome.getByRole("button", { name: /Ich lerne es gerade/ }).click();
  await expect(page.getByText("1 · Steine ziehen")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog", { name: /Willkommen/ })).toHaveCount(0);
});

test("an invitation link creates the profile, an account and the friendship in one go", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const ada = await onlineGuest(browser, "Ada");
  await ada.getByRole("tab", { name: /Freunde/ }).click();
  const code = (await ada.getByTestId("invite-code").textContent()) ?? "";
  expect(code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);

  const page = await (await browser.newContext(fresh)).newPage();
  await page.addInitScript(
    (server) =>
      localStorage.setItem("tavli.online", JSON.stringify({ state: { serverUrl: server }, version: 1 })),
    SERVER_URL,
  );
  await page.goto(`/?invite=${code.toLowerCase()}`);
  // the invitation welcomes instead of the first-start screen
  await expect(page.getByRole("heading", { name: /Ada lädt dich ein/ })).toBeVisible();
  await expect(page.getByRole("dialog", { name: /^Willkommen/ })).toHaveCount(0);
  await page.getByLabel("Dein Spielername").fill("Cleo");
  await page.getByLabel(/Konto mit Passwort/).check();
  const user = `cleo${Date.now() % 100000}`;
  await page.locator("input[autocomplete=username]").fill(user);
  await page.locator("input[autocomplete=new-password]").fill("long enough");
  await page.getByRole("button", { name: /Profil anlegen & Freund werden/ }).click();

  // recovery codes first
  await expect(page.getByTestId("recovery-codes").locator("li")).toHaveCount(10);
  await page.getByLabel(/sicher aufbewahrt/).check();
  await page.getByRole("button", { name: "Fertig" }).click();

  // then the friends list, with Ada in it; Ada sees Cleo without accepting anything
  await expect(page.getByText("Ada", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(ada.getByText("Cleo", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
});
