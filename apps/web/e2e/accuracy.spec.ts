import { expect, test } from "@playwright/test";
import { closeContexts, onlineGuest, openAccount } from "./helpers";

test.afterEach(closeContexts);

test("a new player sees that the accuracy comes after the first online match", async ({ browser }) => {
  const page = await onlineGuest(browser, "Ada");
  await openAccount(page);
  await expect(page.getByRole("heading", { name: /Deine Genauigkeit/ })).toBeVisible();
  await expect(page.getByText(/Noch keine ausgewertete Partie/)).toBeVisible();
});

test("the own accuracy shows level, trend and one bar per match", async ({ browser }) => {
  const page = await onlineGuest(browser, "Bea");
  const day = 24 * 60 * 60 * 1000;
  const matches = [0.81, 0.7, 0.64, 0.75, 0.68].map((agreement, i) => ({
    matchId: `m${i}`,
    at: new Date(Date.now() - i * day).toISOString(),
    decisions: 40,
    agreement,
    averageLoss: 0.03,
  }));
  // the analysis itself needs whole online matches; its numbers come from the server's tests
  await page.route("**/api/account/accuracy", (route) =>
    route.fulfill({
      json: {
        summary: { decisions: 200, agreement: 0.736, averageLoss: 0.031 },
        before: { decisions: 120, agreement: 0.69, averageLoss: 0.04 },
        matches,
      },
    }),
  );
  await openAccount(page);
  const card = page.getByTestId("accuracy");
  await expect(card).toContainText("74 %");
  await expect(card).toContainText("Stark");
  await expect(card).toContainText("▲ 5 Prozentpunkte");
  await expect(card.locator("svg path")).toHaveCount(5);
});
