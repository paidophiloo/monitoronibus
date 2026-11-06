import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const qa = "../../docs/qa";
const title = "Fechamento de turno";
const missingTrip = /Investigar PM-0610/;
const swapTrip = /Investigar PM-0615/;

async function openReview(page: Page) {
  await page.goto("/");
  await expect(page.locator(".viewport")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /Revisar turno/ }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

test("review moves from unresolved evidence to 3D focus and an auditable resolution", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const glb = page.waitForResponse(
    (response) => response.url().endsWith("/models/sp-standard-bus.glb") && response.ok(),
  );
  await openReview(page);
  await glb;

  await expect(page.getByRole("button", { name: missingTrip })).toBeVisible();
  await expect(page.getByRole("button", { name: swapTrip })).toBeVisible();
  await expect(page.getByText("Escala, portaria e GPS simulados.")).toBeVisible();

  const canvas = page.locator("canvas");
  expect(
    await canvas.evaluate((element: HTMLCanvasElement) => {
      const gl = element.getContext("webgl2");
      return Boolean(gl && !gl.isContextLost());
    }),
  ).toBe(true);
  const before = await canvas.screenshot();
  await page.getByRole("button", { name: missingTrip }).click();
  const evidence = page.getByRole("region", { name: "Evidências da saída selecionada" });
  await expect(evidence.getByText("Sem confirmação", { exact: true })).toBeVisible();
  await expect(evidence.getByText("Saída sem registro associado")).toBeVisible();
  await expect(evidence.getByText("Posição desatualizada · evidência auxiliar")).toBeVisible();
  await expect(page.locator(".bus-tag strong")).toHaveText("8 1776");
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);

  await page.getByRole("button", { name: swapTrip }).click();
  await expect(evidence.getByText("Dados divergentes", { exact: true })).toBeVisible();
  await expect(evidence.getByText(/Passagem de 7 8042 · PORT-019/)).toBeVisible();
  await expect(evidence.getByText(/Veículo 8 2361/)).toBeVisible();
  await page.getByRole("button", { name: "Localizar no pátio" }).click();
  await expect(page.locator(".bus-tag strong")).toHaveText("7 8042");
  await page.screenshot({ path: qa + "/shift-review-demo.png" });

  const note = "Substituição conferida com a portaria.";
  await page.getByRole("textbox", { name: "Conclusão da ocorrência" }).fill(note);
  await page.getByRole("button", { name: "Salvar conclusão" }).click();
  await expect(page.getByRole("button", { name: "Reabrir ocorrência" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar ocorrências" }).click();
  const path = await (await download).path();
  expect(path).toBeTruthy();
  const csv = await readFile(path!, "utf8");
  expect(csv).toContain("PM-0615");
  expect(csv).toContain(note);
  expect(csv).toContain("7 8042");
  expect(csv).toContain("data_origin");
  expect(csv).toContain(",DEMO\r\n");

  await page.getByRole("button", { name: "Fechar revisão" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeHidden();
  await expect(page.getByRole("button", { name: title })).toBeFocused();
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: /Revisar turno/ }).click();
  await page.getByRole("button", { name: swapTrip }).click();
  await expect(page.getByRole("button", { name: "Reabrir ocorrência" })).toBeVisible();
  await page.getByRole("button", { name: "Reabrir ocorrência" }).click();
  await expect(page.getByRole("button", { name: "Salvar conclusão" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("imported shift has its own provenance and retains conclusions when reopened", async ({ page }) => {
  await openReview(page);
  const scheduleCsv = {
    name: "escala.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "trip_id,vehicle_id,planned_at\nCSV-001,8 1776,2026-11-06T06:30:00-03:00\n",
    ),
  };
  const gateCsv = {
    name: "portaria.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "event_id,vehicle_id,observed_at,direction,trip_id\nG-001,8 1776,2026-11-06T06:38:00-03:00,OUT,CSV-001\n",
    ),
  };
  await page.getByText("Importar arquivos CSV", { exact: true }).click();
  const scheduleInput = page.getByLabel("Arquivo de escala");
  await scheduleInput.setInputFiles({
    ...scheduleCsv,
    buffer: Buffer.from("trip_id,vehicle_id\nCSV-001,8 1776\n"),
  });
  await page.getByLabel("Arquivo de portaria").setInputFiles(gateCsv);
  const submit = page.getByRole("button", { name: "Revisar arquivos" });
  await submit.click();
  await expect(page.getByRole("alert")).toContainText("planned_at");
  await expect(page.getByRole("button", { name: missingTrip })).toBeVisible();
  await scheduleInput.setInputFiles(scheduleCsv);
  await submit.click();
  await page.getByRole("button", { name: /Investigar CSV-001/ }).click();
  const evidence = page.getByRole("region", { name: "Evidências da saída selecionada" });
  await expect(page.getByText("Escala e portaria fornecidas pelo usuário.")).toBeVisible();
  await expect(evidence.getByText("Com atraso", { exact: true })).toBeVisible();
  await expect(evidence.getByText(/06:38/)).toBeVisible();
  await expect(evidence.getByText("Posição indisponível para esta saída")).toBeVisible();
  await expect(page.getByRole("button", { name: missingTrip })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Localizar no pátio" })).not.toBeVisible();

  const note = "Horário real conferido no registro importado.";
  await page.getByRole("textbox", { name: "Conclusão da ocorrência" }).fill(note);
  await page.getByRole("button", { name: "Salvar conclusão" }).click();

  await page.reload();
  await page.getByRole("button", { name: /Revisar turno/ }).click();
  await page.getByText("Importar arquivos CSV", { exact: true }).click();
  await page.getByLabel("Arquivo de escala").setInputFiles(scheduleCsv);
  await page.getByLabel("Arquivo de portaria").setInputFiles(gateCsv);
  await page.getByRole("button", { name: "Revisar arquivos" }).click();
  await page.getByRole("button", { name: /Investigar CSV-001/ }).click();
  await expect(page.getByRole("button", { name: "Reabrir ocorrência" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Conclusão da ocorrência" })).toHaveValue(note);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar ocorrências" }).click();
  const path = await (await download).path();
  expect(path).toBeTruthy();
  const csv = await readFile(path!, "utf8");
  expect(csv).toContain(",CSV_LOCAL\r\n");
  expect(csv).toContain(note);
});

test("DEMO evidence is kept out of LIVE and REPLAY", async ({ page }) => {
  await openReview(page);
  await expect(page.getByRole("button", { name: missingTrip })).toBeVisible();
  for (const name of ["LIVE", "REPLAY"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("button", { name: missingTrip })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Localizar no pátio" })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "DEMO", exact: true }).click();
  await expect(page.getByRole("button", { name: missingTrip })).toBeVisible();
});

test("review fits a small screen and supports selecting an occurrence", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReview(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole("button", { name: missingTrip }).click();
  await expect(page.getByRole("textbox", { name: "Conclusão da ocorrência" })).toBeVisible();
  await page.screenshot({ path: qa + "/shift-review-mobile.png", fullPage: true });
});
