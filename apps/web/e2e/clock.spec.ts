import { expect, test } from "@playwright/test";
import { onlineGuest } from "./helpers";

test("blitz: both players see the chess clock with delay and reserve", async ({ browser }) => {
  test.setTimeout(90_000);
  const mia = await onlineGuest(browser, "Mia");
  const noa = await onlineGuest(browser, "Noa");
  for (const p of [mia, noa]) {
    await p.getByRole("tab", { name: "Spielen" }).click();
    await p.getByRole("button", { name: "Hypergammon", exact: true }).click();
    await p.getByRole("button", { name: "1", exact: true }).click();
    await p.getByRole("button", { name: /Blitz/ }).click();
    await expect(p.getByText(/8 Sekunden pro Zug frei/)).toBeVisible();
    await p.getByRole("button", { name: /Gegner suchen/ }).click();
  }
  for (const p of [mia, noa]) {
    await expect(p.getByText(/Hypergammon · Spiel 1/)).toBeVisible({ timeout: 15_000 });
    await expect(p.getByTestId("clock-me")).toContainText("1:00");
    await expect(p.getByTestId("clock-opponent")).toBeVisible();
  }
  // the player to move sees the free delay counting down
  await expect
    .poll(async () => (await mia.getByText(/^\+\d$/).count()) + (await noa.getByText(/^\+\d$/).count()))
    .toBeGreaterThan(0);
});
