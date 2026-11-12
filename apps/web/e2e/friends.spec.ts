import { expect, test } from "@playwright/test";
import { onlineGuest } from "./helpers";

test("friends via link, a challenge starts a match, a third player watches it live", async ({ browser }) => {
  test.setTimeout(90_000);
  const ann = await onlineGuest(browser, "Ann");
  const ben = await onlineGuest(browser, "Ben");
  const wes = await onlineGuest(browser, "Wes");

  // Ann shares her friend link, Ben opens it and sends a request
  await ann.getByRole("tab", { name: /Freunde/ }).click();
  const link = await ann.locator("span.select-all").innerText();
  await ben.goto(link);
  await ben.getByRole("button", { name: "Anfrage senden" }).click();
  await expect(ben.getByText("Anfrage gesendet.")).toBeVisible();
  await ben.getByRole("button", { name: "OK" }).click();

  // Ann accepts; Ben shows as online
  await expect(ann.getByText("Freundschaftsanfragen")).toBeVisible({ timeout: 15_000 });
  await ann.getByRole("button", { name: "Annehmen" }).click();
  await expect(ann.getByText("online", { exact: true })).toBeVisible({ timeout: 15_000 });

  // Ann challenges Ben to a 1-point Portes match; Ben accepts from wherever he is
  await ann.getByRole("button", { name: /Herausfordern/ }).click();
  await ann.getByRole("dialog").getByRole("button", { name: "Portes", exact: true }).click();
  await ann.getByRole("dialog").getByRole("button", { name: "1", exact: true }).click();
  await ann.getByRole("button", { name: "Herausforderung senden" }).click();
  await expect(ben.getByText(/Ann fordert dich heraus/)).toBeVisible({ timeout: 10_000 });
  await ben.getByRole("button", { name: "Annehmen" }).click();
  await expect(ann.getByText(/Portes · Spiel 1/)).toBeVisible({ timeout: 15_000 });
  await expect(ben.getByText(/Portes · Spiel 1/)).toBeVisible();

  // a private challenge is not listed live; a public queue match is
  await wes.getByRole("tab", { name: "Live" }).click();
  await expect(wes.getByText(/Gerade läuft kein öffentliches Match/)).toBeVisible();

  // Ben resigns; both then start a public match from the queue, which Wes watches
  await ben
    .getByRole("button", { name: /Aufgeben/ })
    .first()
    .click();
  await ben.getByRole("button", { name: /Sofort aufgeben/ }).click();
  for (const p of [ann, ben]) {
    await p.getByRole("dialog").getByRole("button", { name: /Menü/ }).click();
    await p.getByRole("button", { name: /Online spielen/ }).click();
    await p.getByRole("tab", { name: "Spielen" }).click();
    await p.getByRole("button", { name: "Backgammon", exact: true }).click();
    await p.getByRole("button", { name: /Gegner suchen/ }).click();
  }
  await expect(ann.getByText(/Backgammon · Spiel 1/)).toBeVisible({ timeout: 15_000 });
  await wes.getByRole("tab", { name: "Spielen" }).click();
  await wes.getByRole("tab", { name: "Live" }).click();
  await wes.getByRole("button", { name: /Ann .*Ben|Ben .*Ann/ }).click();
  await expect(wes.getByText(/Zuschauen/)).toBeVisible();
  await expect(wes.locator("svg").first()).toBeVisible();
});
