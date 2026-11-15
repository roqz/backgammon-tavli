import { expect, test } from "@playwright/test";
import { closeContexts, nav, newGame, onlineGuest } from "./helpers";

test.afterEach(closeContexts);

test("friends via invitation link, a challenge starts a match, a third player watches it live", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ann = await onlineGuest(browser, "Ada");
  const ben = await onlineGuest(browser, "Bodo");
  const wes = await onlineGuest(browser, "Wes");

  // Ada shares her invitation link, Bodo opens it: friends at once, no request to accept
  await ann.getByRole("tab", { name: /Freunde/ }).click();
  await expect(ann.getByTestId("invite-code")).toBeVisible();
  const link = (await ann.locator("span.select-all.break-all").textContent()) ?? "";
  expect(link).toMatch(/[?]invite=/);
  await ben.goto(link);
  await ben.getByRole("button", { name: "Freund werden" }).click();
  await expect(ben.getByText("Du und Ada seid jetzt befreundet.")).toBeVisible();
  await ben.getByRole("button", { name: "OK" }).click();
  await expect(ann.getByText("online", { exact: true })).toBeVisible({ timeout: 15_000 });

  // Ada challenges Bodo to a 1-point Portes match; Bodo accepts from wherever he is
  await ann.getByRole("button", { name: /Herausfordern/ }).click();
  await ann.getByRole("dialog").getByRole("button", { name: "Portes", exact: true }).click();
  await ann.getByRole("dialog").getByRole("button", { name: "1", exact: true }).click();
  await ann.getByRole("button", { name: "Herausforderung senden" }).click();
  await expect(ben.getByText(/Ada fordert dich heraus/)).toBeVisible({ timeout: 10_000 });
  await ben.getByRole("button", { name: "Annehmen" }).click();
  await expect(ann.getByText(/Portes · Spiel 1/)).toBeVisible({ timeout: 15_000 });
  await expect(ben.getByText(/Portes · Spiel 1/)).toBeVisible();

  // a private challenge is not listed live; a public queue match is
  // (other tests share the server, so the list need not be empty: only this match must be missing)
  await wes.getByRole("tab", { name: "Live" }).click();
  await expect(wes.getByText("Live-Matches")).toBeVisible();
  await expect(wes.getByText("Lade …")).toHaveCount(0);
  await expect(wes.getByRole("button", { name: /Portes · 1 Punkt/ }).filter({ hasText: /Ada/ })).toHaveCount(
    0,
  );

  // Bodo resigns; both then start a public match from the queue, which Wes watches
  await ben
    .getByRole("button", { name: /Aufgeben/ })
    .first()
    .click();
  await ben.getByRole("button", { name: /Sofort aufgeben/ }).click();
  for (const p of [ann, ben]) {
    await p.getByRole("dialog").getByRole("button", { name: /Menü/ }).click();
    await newGame(p, "Online-Gegner");
    await p.getByRole("button", { name: "Backgammon", exact: true }).click();
    await p.getByRole("button", { name: /Gegner suchen/ }).click();
  }
  await expect(ann.getByText(/Backgammon · Spiel 1/)).toBeVisible({ timeout: 15_000 });
  await nav(wes, "Online");
  await wes.getByRole("tab", { name: "Live" }).click();
  await wes.getByRole("button", { name: /Ada .*Bodo|Bodo .*Ada/ }).click();
  await expect(wes.getByText(/Zuschauen/)).toBeVisible();
  await expect(wes.locator("svg").first()).toBeVisible();
});
