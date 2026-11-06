import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const qa = "../../docs/qa";

test("model has purpose-built glTF mesh families", () => {
  const file = readFileSync("public/models/sp-standard-bus.glb");
  expect(file.subarray(0, 4).toString()).toBe("glTF");
  expect(file.readUInt32LE(4)).toBe(2);
  const document = JSON.parse(
    file.subarray(20, 20 + file.readUInt32LE(12)).toString(),
  );
  const names = document.nodes
    .filter((node: { mesh?: number }) => node.mesh !== undefined)
    .map((node: { name: string }) => node.name);
  for (const family of [
    "Body",
    "Windows",
    "Wheels",
    "Doors",
    "Roof",
    "DestinationSign",
    "Livery",
  ]) {
    expect(
      names.some((name: string) => name.startsWith(family)),
      family,
    ).toBe(true);
  }
});

test("WebGL draws the fleet, responds to camera controls, and keeps modes separate", async ({
  page,
}) => {
  // Camera and raycast checks need stable geometry; playback has its own suite.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  const contextFailures: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
    if (/context lost|GL_INVALID/i.test(message.text()))
      contextFailures.push(message.text());
  });
  const glb = page.waitForResponse(
    (response) =>
      response.url().endsWith("/models/sp-standard-bus.glb") && response.ok(),
  );
  await page.goto("/");
  await glb;
  await expect(page.locator(".viewport")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  expect(
    await canvas.evaluate((element: HTMLCanvasElement) => {
      const gl = element.getContext("webgl2");
      return gl && !gl.isContextLost() && gl.drawingBufferWidth > 500;
    }),
  ).toBe(true);
  await page.screenshot({ path: qa + "/scene-first-slice.png" });
  const before = await canvas.screenshot();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width * 0.47,
    bounds.y + bounds.height * 0.55,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.58,
    bounds.y + bounds.height * 0.58,
    { steps: 8 },
  );
  await page.mouse.up();
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  const orbited = await canvas.screenshot();
  await page.mouse.move(
    bounds.x + bounds.width * 0.47,
    bounds.y + bounds.height * 0.55,
  );
  await page.mouse.down({ button: "right" });
  await page.mouse.move(
    bounds.x + bounds.width * 0.53,
    bounds.y + bounds.height * 0.57,
    { steps: 5 },
  );
  await page.mouse.up({ button: "right" });
  const panned = await canvas.screenshot();
  expect(panned.equals(orbited)).toBe(false);
  await page.getByRole("button", { name: "Aproximar câmera" }).click();
  expect((await canvas.screenshot()).equals(panned)).toBe(false);
  await page.getByRole("button", { name: "Restaurar vista geral" }).click();
  await page.getByRole("button", { name: "Focar veículo" }).click();
  await page.screenshot({ path: qa + "/bus-front-three-quarter.png" });
  await page.getByRole("button", { name: "Perfil", exact: true }).click();
  await page.screenshot({ path: qa + "/bus-profile.png" });
  await page.getByRole("button", { name: "Superior", exact: true }).click();
  await page.screenshot({ path: qa + "/bus-top.png" });
  await page.getByRole("button", { name: "Restaurar vista geral" }).click();

  // Select a different bus via a genuine Three.js raycast, not via the fleet list.
  await page.getByRole("button", { name: "Limpar seleção" }).click();
  const position = await canvas.boundingBox();
  if (!position) throw new Error("Canvas missing");
  const projectedX =
    position.x +
    position.width / 2 +
    ((position.height / 35) * (-7.9 * 59 - 2 * 38)) / Math.hypot(38, 59);
  const pitch = Math.atan2(37.4, Math.hypot(38, 59));
  const vertical =
    (1.5 - 0.6) * Math.cos(pitch) -
    ((-7.9 * 38 + 2 * 59) / Math.hypot(38, 59)) * Math.sin(pitch);
  const projectedY =
    position.y + position.height / 2 - (position.height / 35) * vertical;
  await page.mouse.click(projectedX, projectedY);
  await expect(page.locator(".vehicle-id")).toHaveText("7 9154");
  await page.getByRole("button", { name: "Frota de demonstração" }).click();
  for (const id of ["8 1029", "8 1776", "8 2361"]) {
    await page.getByRole("button", { name: new RegExp(id) }).click();
    await expect(page.locator(".vehicle-id")).toHaveText(id);
  }
  const liveResponse = page.waitForResponse(
    (response) => response.url().includes("mode=LIVE") && response.ok(),
  );
  await page.getByRole("button", { name: "LIVE", exact: true }).click();
  expect(await (await liveResponse).json()).toMatchObject({
    mode: "LIVE",
    state: "not_configured",
    vehicles: [],
  });
  await expect(page.getByRole("status")).toContainText("LIVE indisponível");
  await expect(page.locator(".vehicle-id")).toHaveCount(0);
  await page.getByRole("button", { name: "REPLAY", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("REPLAY sem registros");
  await page.getByRole("button", { name: "Abrir demonstração" }).click();
  await expect(page.locator(".vehicle-id")).toHaveText("8 2361");
  expect(errors).toEqual([]);
  expect(contextFailures).toEqual([]);
});

test("mobile scene and controls fit without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".viewport")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: qa + "/scene-mobile.png" });
});

test("a published coordinate reference lands on the same metric axes as the scene", async () => {
  const { localPoint } = await import("../src/observations");
  const origin: [number, number] = [-46.633308, -23.55052];
  const [east, north] = localPoint(origin, [-46.632308, -23.54952]);
  // Independent reference from PROJ via pyproj (EPSG:4326 to EPSG:32723).
  expect(east).toBeCloseTo(100.8288, 2);
  expect(north).toBeCloseTo(-111.901, 2);
  expect(localPoint(origin, origin)).toEqual([0, 0]);
});

test("observed and recorded envelopes reach the correct views (synthetic test fixture only)", async ({
  page,
}) => {
  const now = Date.now();
  const observation = {
    vehicleId: "50103",
    lineId: 992,
    lineLabel: "4310-10",
    latitude: -23.55,
    longitude: -46.63,
    observedAt: new Date(now - 120000).toISOString(),
    receivedAt: new Date(now - 110000).toISOString(),
  };
  const area = {
    name: "Perímetro da fixture de teste",
    source: "Fixture sintética isolada",
    origin: [-46.63, -23.55],
    ring: [
      [-46.6302, -23.5502],
      [-46.6298, -23.5502],
      [-46.6298, -23.5498],
      [-46.6302, -23.5498],
      [-46.6302, -23.5502],
    ],
  };
  // Keep this REST-only fixture isolated from the actual unconfigured backend stream.
  await page.routeWebSocket("**/api/vehicles/live", (socket) => socket.close());
  await page.route("**/api/vehicles/snapshot?*", async (route) => {
    const mode = new URL(route.request().url()).searchParams.get("mode");
    await route.fulfill({
      json: {
        version: 1,
        mode,
        state: mode === "LIVE" ? "stale" : "recorded",
        source: "sptrans_olhovivo",
        area,
        vehicles: [observation],
        ...(mode === "REPLAY"
          ? {
              range: [
                observation.observedAt,
                new Date(now - 115000).toISOString(),
              ],
              at: observation.observedAt,
            }
          : {}),
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "LIVE", exact: true }).click();
  await page.getByRole("button", { name: /50103/ }).click();
  await expect(page.getByRole("heading", { name: area.name })).toBeVisible();
  await expect(page.getByText("Leitura desatualizada")).toBeVisible();
  await expect(page.getByText("Horário do GPS")).toBeVisible();
  await expect(page.getByText("Baia ilustrativa")).toHaveCount(0);
  await page.getByRole("button", { name: "REPLAY", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Horário do replay" }),
  ).toBeVisible();
  await expect(page.getByText("REPLAY · Histórico verificado")).toBeVisible();
  await expect(page.getByText("Leitura desatualizada")).toHaveCount(0);
});
