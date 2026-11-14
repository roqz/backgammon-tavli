import { expect, type Page, test } from "@playwright/test";
import { prepare, tapMove } from "./helpers";

test.use({ isMobile: true, hasTouch: true });

const startHotseat = async (page: Page, settings: Record<string, unknown> = {}) => {
  await prepare(page);
  await page.goto("/");
  if (Object.keys(settings).length) {
    await page.evaluate((patch) => {
      const s = JSON.parse(localStorage.getItem("tavli.settings")!);
      s.state = { ...s.state, ...patch };
      localStorage.setItem("tavli.settings", JSON.stringify(s));
    }, settings);
    await page.reload();
  }
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.getByRole("button", { name: "Mensch (gleiches Gerät)" }).click();
  await page.getByRole("button", { name: "Starten" }).click();
  await expect(page.locator("svg circle[stroke-dasharray]").first()).toBeVisible();
};

/** The page does not scroll and the main action is on screen. */
const fitsScreen = async (page: Page) => {
  const { scroll, inner } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollHeight,
    inner: window.innerHeight,
  }));
  expect(scroll).toBeLessThanOrEqual(inner + 1);
  const confirm = page.getByRole("button", { name: /^Fertig|^Zug beenden|^Bestätigen/ });
  await expect(confirm).toBeInViewport();
};

test.describe("portrait", () => {
  test.use({ viewport: { width: 390, height: 664 } });
  test("turned board, fixed action dock, moves by tapping", async ({ page }) => {
    await startHotseat(page);
    const box = (await page.getByTestId("phone-board").boundingBox())!;
    expect(box.height).toBeGreaterThan(box.width); // turned by 90°
    await fitsScreen(page);
    expect(await tapMove(page)).toBe(true);
    await expect(page.getByRole("button", { name: /Rückgängig/ })).toBeEnabled();

    // history, settings and resigning live in the "More" sheet
    await page.getByRole("button", { name: "Mehr" }).click();
    await expect(page.getByRole("dialog").getByText("Verlauf")).toBeVisible();
    await page.getByRole("button", { name: "Einstellungen" }).click();
    await expect(page.getByText("Ausrichtung im Spiel (Handy)")).toBeVisible();
  });
});

test.describe("landscape", () => {
  test.use({ viewport: { width: 844, height: 340 } });
  test("board at full height, actions on the right", async ({ page }) => {
    await startHotseat(page);
    const box = (await page.getByTestId("phone-board").boundingBox())!;
    expect(box.width).toBeGreaterThan(box.height);
    expect(box.height).toBeGreaterThan(340 * 0.9);
    await fitsScreen(page);
    expect(await tapMove(page)).toBe(true);
    await expect(page.getByRole("button", { name: /Rückgängig/ })).toBeEnabled();
  });
});

test.describe("always landscape on an upright phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the game screen is turned and still plays by tapping", async ({ page }) => {
    await startHotseat(page, { gameOrientation: "landscape" });
    await expect(page.getByTestId("phone-stage")).toHaveAttribute("data-turned", "true");
    // on screen the turned board is tall: its long side runs along the phone
    const box = (await page.getByTestId("phone-board").boundingBox())!;
    expect(box.height).toBeGreaterThan(box.width);
    expect(box.width).toBeGreaterThan(390 * 0.85);
    expect(await tapMove(page)).toBe(true);
    await expect(page.getByRole("button", { name: /Rückgängig/ })).toBeEnabled();
    await page.getByRole("button", { name: /Rückgängig/ }).click();
    expect(await tapMove(page)).toBe(true);
  });
});
