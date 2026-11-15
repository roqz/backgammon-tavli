import { expect, test } from "@playwright/test";
import { E2E_ADMIN_TOKEN } from "../playwright.config";
import { closeContexts, nav, onlineGuest, SERVER_URL } from "./helpers";

test.afterEach(closeContexts);

test("support page: link and costs, a code makes the profile a supporter with the patron looks", async ({
  browser,
}) => {
  const page = await onlineGuest(browser, "Pia");
  await nav(page, "Profil");
  await page.getByRole("button", { name: /Projekt unterstützen/ }).click();
  await expect(page.getByTestId("support-link")).toHaveAttribute("href", "https://example.org/support");
  await expect(page.getByText("Laufende Kosten: etwa 8 € im Monat")).toBeVisible();

  const res = await fetch(`${SERVER_URL}/api/admin/supporter-codes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": E2E_ADMIN_TOKEN },
    body: JSON.stringify({ count: 1, months: 12, note: "e2e" }),
  });
  const { codes } = (await res.json()) as { codes: string[] };
  await page.getByLabel("Unterstützer-Code einlösen").fill(codes[0]!);
  await page.getByRole("button", { name: "Einlösen" }).click();
  await expect(page.getByText("Danke für deine Unterstützung!")).toBeVisible();
  // the same code does not work twice
  await page.getByLabel("Unterstützer-Code einlösen").fill(codes[0]!);
  await page.getByRole("button", { name: "Einlösen" }).click();
  await expect(page.getByText(/ungültig oder wurde schon eingelöst/)).toBeVisible();

  // named in the thank-you list only after opting in
  await expect(page.getByTestId("thanks")).toHaveCount(0);
  await page.getByRole("switch", { name: /Danke-Liste/ }).click();
  await expect(page.getByTestId("thanks")).toContainText("Pia");

  // the patron board is open now
  await nav(page, "Profil");
  await page
    .getByRole("button", { name: /Vitrine/ })
    .first()
    .click();
  const patron = page.getByRole("button", { name: /Mäzen/ }).first();
  await expect(patron).toBeEnabled();
});
