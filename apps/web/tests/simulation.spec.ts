import { expect, test, type Locator, type Page } from "@playwright/test";

const qa = "../../docs/qa";
const simulationName = "Simulação do pátio";
const movementsName = "Movimentos do pátio";
const controls = (page: Page) => page.getByRole("region", { name: simulationName });
const events = (page: Page) => page.getByRole("region", { name: movementsName });
const timeline = (page: Page) => controls(page).getByRole("slider", { name: "Tempo da simulação" });
const time = async (page: Page) => Number(await timeline(page).inputValue());

async function openDemo(page: Page, reducedMotion: "reduce" | "no-preference") {
  await page.emulateMedia({ reducedMotion });
  await page.goto("/");
  await expect(page.locator(".viewport")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "DEMO", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(controls(page)).toBeVisible();
}

async function seek(slider: Locator, seconds: number) {
  const step = Number((await slider.getAttribute("step")) || 1);
  const minimum = Number((await slider.getAttribute("min")) || 0);
  await slider.press("Home");
  for (let n = 0; n < Math.round((seconds - minimum) / step); n++) {
    await slider.press("ArrowRight");
  }
  await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(seconds, 0);
}

async function projectedTag(tag: Locator) {
  return tag.evaluate((label) => {
    const bounds = label.getBoundingClientRect();
    const viewport = label.closest(".viewport")!.getBoundingClientRect();
    return { x: bounds.x - viewport.x, y: bounds.y - viewport.y };
  });
}

test("DEMO moves a selected GLB on screen, can pause and restart, and logs simulated movements", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const glb = page.waitForResponse(
    (response) => response.url().endsWith("/models/sp-standard-bus.glb") && response.ok(),
  );
  await openDemo(page, "reduce");
  await glb;
  const play = controls(page).getByRole("button", { name: "Reproduzir simulação" });
  const pause = controls(page).getByRole("button", { name: "Pausar simulação" });
  const restart = controls(page).getByRole("button", { name: "Reiniciar simulação" });
  await expect(play).toBeVisible();
  await expect(timeline(page)).toHaveValue("0");
  await expect(events(page).getByText("DEMO", { exact: true })).toBeVisible();
  await expect(events(page)).toContainText("Aguardando a primeira passagem simulada.");

  const canvas = page.locator(".viewport canvas");
  const tag = page.locator(".bus-tag").filter({ hasText: "8 2361" });
  await expect(tag).toBeVisible();
  const start = await projectedTag(tag);
  const firstImage = await canvas.screenshot();

  await seek(timeline(page), 8);
  await expect.poll(async () => {
    const current = await projectedTag(tag);
    return Math.hypot(current.x - start.x, current.y - start.y);
  }).toBeGreaterThan(10);
  expect((await canvas.screenshot()).equals(firstImage)).toBe(false);
  await timeline(page).evaluate((slider) => slider.blur());
  await page.screenshot({ path: qa + "/live-simulation-demo.png" });

  await controls(page).getByRole("combobox", { name: "Velocidade da simulação" }).selectOption("2");
  await play.click();
  await expect(pause).toBeVisible();
  await expect.poll(() => time(page)).toBeGreaterThan(8);
  await pause.click();
  await expect(play).toBeVisible();
  const paused = await time(page);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const pausedPosition = await projectedTag(tag);
  // Wait across successive animation frames to catch a clock or mesh still moving.
  const frameStart = await page.evaluate(() => performance.now());
  await page.waitForFunction((start) => performance.now() - start >= 500, frameStart);
  expect(await time(page)).toBe(paused);
  const held = await projectedTag(tag);
  expect(Math.hypot(held.x - pausedPosition.x, held.y - pausedPosition.y)).toBeLessThan(1);

  await timeline(page).press("End");
  const entries = events(page).getByRole("listitem");
  await expect(entries).toHaveCount(3);
  await expect(entries.filter({ hasText: "Entrada na portaria" })).toContainText("Ônibus 8 2361");
  await expect(entries.filter({ hasText: "Saída pela portaria" })).toHaveText([
    /Ônibus 8 1776/,
    /Ônibus 8 2361/,
  ]);
  await expect(controls(page)).toBeInViewport({ ratio: 1 });
  await timeline(page).evaluate((slider) => slider.blur());
  await page.screenshot({ path: qa + "/live-simulation-events.png" });
  await restart.click();
  await expect(timeline(page)).toHaveValue("0");
  await expect(entries).toHaveCount(0);
  await expect(tag).toBeVisible();
  await expect.poll(async () => {
    const current = await projectedTag(tag);
    return Math.hypot(current.x - start.x, current.y - start.y);
  }).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test("DEMO playback is isolated from LIVE and REPLAY", async ({ page }) => {
  await openDemo(page, "no-preference");
  await expect(controls(page).getByRole("button", { name: "Pausar simulação" })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(controls(page).getByRole("button", { name: "Reproduzir simulação" })).toBeVisible();
  for (const mode of ["LIVE", "REPLAY"] as const) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect(controls(page)).toHaveCount(0);
    await expect(events(page)).toHaveCount(0);
    await expect(page.locator(".bus-tag")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "DEMO", exact: true }).click();
  await expect(controls(page)).toBeVisible();
});

test("small-screen simulation respects reduced motion and fits its controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDemo(page, "reduce");
  await expect(controls(page).getByRole("button", { name: "Reproduzir simulação" })).toBeVisible();
  await expect(timeline(page)).toHaveValue("0");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await timeline(page).press("End");
  await expect(events(page).getByText("Entrada na portaria")).toBeVisible();
  await timeline(page).evaluate((slider) => slider.blur());
  await page.screenshot({ path: qa + "/live-simulation-mobile.png", fullPage: true });
});
