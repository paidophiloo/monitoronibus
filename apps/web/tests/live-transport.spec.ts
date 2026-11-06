import { expect, test, type WebSocketRoute } from "@playwright/test";

test("browser opens the real same-origin LIVE channel without inventing data", async ({ page }) => {
  await page.goto("/");
  const opening = page.waitForEvent("websocket", {
    predicate: (socket) => socket.url().endsWith("/api/vehicles/live"),
  });
  await page.getByRole("button", { name: "LIVE", exact: true }).click();
  const socket = await opening;
  const socketUrl = new URL(socket.url());
  expect(socketUrl.host).toBe(new URL(page.url()).host);
  await expect(page.getByText("SPTrans Olho Vivo · canal WebSocket")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "LIVE indisponível" })).toBeVisible();
  await expect(page.locator(".vehicle-id")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Simulação do pátio" })).toHaveCount(0);
  const closing = socket.waitForEvent("close");
  await page.getByRole("button", { name: "REPLAY", exact: true }).click();
  await closing;
  await expect(page.getByRole("status").filter({ hasText: "REPLAY sem registros" })).toBeVisible();
});

test("a lost LIVE stream resumes a fresh HTTP snapshot without inserting demo data", async ({ page }) => {
  let stream: WebSocketRoute | undefined;
  let httpReads = 0;
  await page.route("**/api/vehicles/snapshot?mode=LIVE", (route) => {
    httpReads++;
    return route.fulfill({
      json: { version: 1, mode: "LIVE", state: "not_configured", vehicles: [] },
    });
  });
  await page.routeWebSocket("**/api/vehicles/live", (socket) => {
    if (!stream) {
      stream = socket;
      socket.send(JSON.stringify({ version: 1, mode: "LIVE", state: "not_configured", vehicles: [] }));
    } else {
      socket.close();
    }
  });
  await page.goto("/");
  const initialResponse = page.waitForResponse((response) =>
    response.url().includes("/api/vehicles/snapshot?mode=LIVE"),
  );
  await page.getByRole("button", { name: "LIVE", exact: true }).click();
  await (await initialResponse).finished();
  await expect(page.getByText("SPTrans Olho Vivo · canal WebSocket")).toBeVisible();
  await expect.poll(() => httpReads).toBeGreaterThanOrEqual(1);

  const initialReads = httpReads;
  await stream!.close({ code: 1011, reason: "Test interruption" });
  await expect.poll(() => httpReads).toBeGreaterThan(initialReads);
  await expect(page.getByText("SPTrans Olho Vivo · consulta HTTP")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "LIVE indisponível" })).toBeVisible();
  await expect(page.locator(".bus-tag")).toHaveCount(0);
});
