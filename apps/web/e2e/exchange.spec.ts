import { expect, test } from "@playwright/test";
import { nav } from "./helpers";

// Ten tokens: two weeks with all three tasks done.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("tavli.career")) return;
    localStorage.setItem(
      "tavli.career",
      JSON.stringify({ state: { weeks: { "2026-W40": [0, 1, 2], "2026-W41": [0, 1, 2] } }, version: 1 }),
    );
  });
});

test("the exchange offers only what no achievement unlocks; a sound set taken there can be chosen", async ({
  page,
}) => {
  await page.goto("/");
  await nav(page, "Profil");
  await page
    .getByRole("button", { name: /Vitrine/ })
    .first()
    .click();
  await expect(page.getByTestId("tokens")).toHaveText("10 Spielmarken");
  const exchange = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Spielmarken eintauschen" }) });
  await expect(exchange.getByText("Klangset „Holz“", { exact: true })).toBeVisible();
  await expect(exchange.getByText("Kurznachrichten „Kafeneio“", { exact: true })).toBeVisible();
  // checker sets, dice and boards that achievements unlock are not for sale
  await expect(exchange.getByText("Perlmutt")).toHaveCount(0);

  await page.getByRole("button", { name: "5 Marken" }).first().click();
  await expect(page.getByTestId("tokens")).toHaveText("5 Spielmarken");

  // the sound set can be chosen in the settings now; the others stay locked
  await page.goto("/");
  await nav(page, "Profil");
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await page.getByRole("button", { name: /^Ton/ }).click();
  await expect(
    page.getByRole("group", { name: "Klangset" }).getByRole("button", { name: "Holz" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("group", { name: "Klangset" }).getByRole("button", { name: /Marmor/ }),
  ).toBeDisabled();
  await page.getByRole("group", { name: "Klangset" }).getByRole("button", { name: "Holz" }).click();
  await expect(
    page.getByRole("group", { name: "Klangset" }).getByRole("button", { name: "Holz" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("dice sounds are in the exchange too and stay locked in the settings until taken", async ({ page }) => {
  await page.goto("/");
  await nav(page, "Profil");
  await page
    .getByRole("button", { name: /Vitrine/ })
    .first()
    .click();
  await expect(page.getByText("Würfelklang „Filz“", { exact: true })).toBeVisible();
  await page.goto("/");
  await nav(page, "Profil");
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await page.getByRole("button", { name: /^Ton/ }).click();
  const dice = page.getByRole("group", { name: "Würfelklang" });
  await expect(dice.getByRole("button", { name: "Holzbrett" })).toHaveAttribute("aria-pressed", "true");
  await expect(dice.getByRole("button", { name: /Filz/ })).toBeDisabled();
});
