import { expect, type Page, test } from "@playwright/test";
import { closeContexts, nav, newGame, onlineGuest, tapMove } from "./helpers";

test.afterEach(closeContexts);

/** Ann and Ben become friends through Ann's invitation link (no request to accept). */
const befriend = async (ann: Page, ben: Page) => {
  await ann.getByRole("tab", { name: /Freunde/ }).click();
  await expect(ann.getByTestId("invite-code")).toBeVisible();
  const link = (await ann.locator("span.select-all.break-all").textContent()) ?? "";
  await ben.goto(link);
  await ben.getByRole("button", { name: "Freund werden" }).click();
  await ben.getByRole("button", { name: "OK" }).click();
};

test("correspondence: invite a friend, accept, and the player to move makes a move", async ({ browser }) => {
  test.setTimeout(90_000);
  const ann = await onlineGuest(browser, "Ann");
  const ben = await onlineGuest(browser, "Ben");
  await befriend(ann, ben);

  await newGame(ann, "Fernpartie");
  // the chosen settings are taken over by the invitation
  await ann.getByRole("button", { name: "1", exact: true }).click();
  await ann.getByRole("button", { name: /Freund einladen/ }).click();
  await expect(ann.getByRole("dialog").getByText(/Backgammon · 1 Punkt/)).toBeVisible();
  await ann
    .getByRole("dialog")
    .getByRole("button", { name: /Anfrage senden/ })
    .click();
  await nav(ann, "Online");
  await expect(ann.getByText("Gesendete Einladungen")).toBeVisible();

  await nav(ben, "Online");
  await ben.getByRole("tab", { name: "Fernpartien" }).click();
  await expect(ben.getByText("Einladungen")).toBeVisible({ timeout: 15_000 });
  await ben.getByRole("button", { name: "Annehmen" }).click();
  await expect(ben.getByText(/Backgammon/).first()).toBeVisible();
  await expect(ben.getByText(/Du bist am Zug|ist am Zug/)).toBeVisible();

  // whoever is to move: roll if needed, move, confirm
  await ann.reload();
  await nav(ann, "Online");
  await ann.getByRole("tab", { name: "Fernpartien" }).click();
  // the list loads first: only then does "your turn" (or "opponent's turn") say who moves
  await expect(ann.getByText(/^(Du bist am Zug|Gegner am Zug)$/).first()).toBeVisible({ timeout: 15_000 });
  const annMoves = await ann.getByText("Du bist am Zug").first().isVisible();
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

test("correspondence: two strangers find each other with the same search", async ({ browser }) => {
  test.setTimeout(90_000);
  const kim = await onlineGuest(browser, "Kim");
  const lou = await onlineGuest(browser, "Lou");
  for (const p of [kim, lou]) {
    await newGame(p, "Fernpartie");
    await p.getByRole("button", { name: /^Hypergammon/ }).click();
    await p.getByRole("button", { name: "1", exact: true }).click();
    await p.getByRole("button", { name: "12 Std./Zug" }).click();
    await p.getByRole("button", { name: /Gegner suchen/ }).click();
  }
  // Kim waits, Lou's search matches and opens the game
  await expect(lou.getByText(/Hypergammon/).first()).toBeVisible({ timeout: 10_000 });
  await expect(lou.getByText(/12 Std\.\/Zug/)).toBeVisible();
  await kim.reload();
  await nav(kim, "Online");
  await kim.getByRole("tab", { name: "Fernpartien" }).click();
  await expect(kim.getByText("Deine Suchen")).toHaveCount(0);
  await expect(kim.getByRole("button", { name: /Lou/ })).toBeVisible();
});

test("friends list starts a correspondence game; the start page lists what is waiting", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const ann = await onlineGuest(browser, "Ann");
  const ben = await onlineGuest(browser, "Ben");
  await befriend(ann, ben);

  // Ann invites Ben straight from the friends list (Ben is preselected)
  await ann.getByRole("button", { name: "Neue Fernpartie: Ben" }).click();
  const dialog = ann.getByRole("dialog");
  await expect(dialog.getByRole("combobox")).toHaveValue(/.+/);
  await expect(dialog.getByRole("combobox").locator("option:checked")).toHaveText("Ben");
  await dialog.getByRole("button", { name: "1", exact: true }).click();
  await dialog.getByRole("button", { name: /Anfrage senden/ }).click();
  await expect(ann.getByText("Einladung zur Fernpartie an Ben gesendet.")).toBeVisible();

  // Ben's start page shows the invitation and leads to it
  await ben.goto("/");
  const todo = ben.getByRole("region", { name: "Zu tun" });
  await expect(todo.getByText("Einladungen zu Fernpartien")).toBeVisible({ timeout: 15_000 });
  await todo.getByRole("button", { name: /Einladungen zu Fernpartien/ }).click();
  await expect(ben.getByRole("tab", { name: "Fernpartien" })).toHaveAttribute("aria-selected", "true");
  await ben.getByRole("button", { name: "Annehmen" }).click();
  await expect(ben.getByText(/ist am Zug/).first()).toBeVisible();
});
