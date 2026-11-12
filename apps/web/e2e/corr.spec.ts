import { expect, type Page, test } from "@playwright/test";
import { onlineGuest, tapMove } from "./helpers";

/** Ann and Ben become friends through Ann's friend link. */
const befriend = async (ann: Page, ben: Page) => {
  await ann.getByRole("tab", { name: /Freunde/ }).click();
  const link = (await ann.locator("span.select-all").textContent()) ?? "";
  await ben.goto(link);
  await ben.getByRole("button", { name: "Anfrage senden" }).click();
  await ben.getByRole("button", { name: "OK" }).click();
  await expect(ann.getByText("Freundschaftsanfragen")).toBeVisible({ timeout: 15_000 });
  await ann.getByRole("button", { name: "Annehmen" }).click();
};

test("correspondence: invite a friend, accept, and the player to move makes a move", async ({ browser }) => {
  test.setTimeout(90_000);
  const ann = await onlineGuest(browser, "Ann");
  const ben = await onlineGuest(browser, "Ben");
  await befriend(ann, ben);

  await ann.getByRole("tab", { name: "Fernpartien" }).click();
  await ann.getByRole("button", { name: /Neue Fernpartie/ }).click();
  await ann.getByRole("dialog").getByRole("button", { name: "1", exact: true }).click();
  await ann
    .getByRole("dialog")
    .getByRole("button", { name: /Anfrage senden/ })
    .click();
  await expect(ann.getByText("Gesendete Einladungen")).toBeVisible();

  await ben.getByRole("button", { name: /Online-Match fortsetzen|Online spielen/ }).click();
  await ben.getByRole("tab", { name: "Fernpartien" }).click();
  await expect(ben.getByText("Einladungen")).toBeVisible({ timeout: 15_000 });
  await ben.getByRole("button", { name: "Annehmen" }).click();
  await expect(ben.getByText(/Backgammon/).first()).toBeVisible();
  await expect(ben.getByText(/Du bist am Zug|ist am Zug/)).toBeVisible();

  // whoever is to move: roll if needed, move, confirm
  await ann.reload();
  await ann.getByRole("button", { name: /Online spielen/ }).click();
  await ann.getByRole("tab", { name: "Fernpartien" }).click();
  const annMoves = await ann.getByText("Du bist am Zug").isVisible();
  const mover = annMoves ? ann : ben;
  if (annMoves)
    await ann
      .getByRole("button", { name: /Ann|Ben/ })
      .first()
      .click();
  if (await mover.getByRole("button", { name: "Würfeln" }).isVisible())
    await mover.getByRole("button", { name: "Würfeln" }).click();
  for (let i = 0; i < 4 && (await mover.getByRole("button", { name: "Zug beenden" }).isDisabled()); i++)
    await tapMove(mover);
  await mover.getByRole("button", { name: "Zug beenden" }).click();
  await expect(mover.getByText(/ist am Zug/)).toBeVisible();
});
