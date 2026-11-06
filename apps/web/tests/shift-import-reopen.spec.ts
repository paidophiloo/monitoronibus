import { expect, test, type Page } from "@playwright/test";

function csv(name: string, contents: string) {
  return { name, mimeType: "text/csv", buffer: Buffer.from(contents) };
}

async function openReview(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Revisar turno" }).click();
  await expect(page.getByRole("heading", { name: "Fechamento de turno" })).toBeVisible();
}

async function submitFiles(
  page: Page,
  schedule: ReturnType<typeof csv>,
  gate: ReturnType<typeof csv>,
) {
  await page.getByText("Importar arquivos CSV", { exact: true }).click();
  await page.getByLabel("Arquivo de escala").setInputFiles(schedule);
  await page.getByLabel("Arquivo de portaria").setInputFiles(gate);
  await page.getByRole("button", { name: "Revisar arquivos" }).click();
}

test("custom Portuguese CSV mapping validates a local time zone and matches the correct gate exit", async ({ page }) => {
  await openReview(page);
  await submitFiles(
    page,
    csv(
      "escala-local.csv",
      "Saída interna;Identificador da frota;Programada para;Serviço\n" +
        'MAP-31;00127;06/11/2026 06:00;"Terminal;Expresso"\n',
    ),
    csv(
      "portaria-local.csv",
      "Chave da leitura;Prefixo capturado;Momento da cancela;Movimento;Saída interna\n" +
        "P-01;00127;06/11/2026 05:59;Entrada;MAP-31\n" +
        "P-02;00127;06/11/2026 06:08;Saída;MAP-31\n",
    ),
  );

  const schedule = page.getByRole("group", { name: "Mapear colunas da escala" });
  const gate = page.getByRole("group", { name: "Mapear colunas da portaria" });
  await expect(schedule).toBeVisible();
  await expect(gate).toBeVisible();

  await schedule.getByLabel("ID da saída", { exact: true }).selectOption("Saída interna");
  const scheduleVehicle = schedule.getByLabel("Prefixo do veículo");
  await expect(scheduleVehicle.locator('option[value="Saída interna"]')).toHaveAttribute("disabled", "");
  await scheduleVehicle.selectOption("Identificador da frota");
  await schedule.getByLabel("Horário programado").selectOption("Programada para");
  await schedule.getByLabel("Linha (opcional)", { exact: true }).selectOption("Serviço");
  await gate.getByLabel("ID do registro").selectOption("Chave da leitura");
  await gate.getByLabel("Prefixo do veículo").selectOption("Prefixo capturado");
  await gate.getByLabel("Horário da passagem").selectOption("Momento da cancela");
  await gate.getByLabel("Sentido da passagem").selectOption("Movimento");
  await gate.getByLabel("ID da saída (opcional)", { exact: true }).selectOption("Saída interna");

  const submit = page.getByRole("button", { name: "Revisar com mapeamento" });
  await submit.click();
  await expect(page.getByRole("alert")).toContainText(/fuso|offset/i);
  await expect(page.getByText("Escala, portaria e GPS simulados.")).toBeVisible();

  await schedule.getByLabel("Fuso dos horários sem offset").selectOption("-03:00");
  await gate.getByLabel("Fuso dos horários sem offset").selectOption("-03:00");
  await expect(page.locator(".viewport")).toHaveAttribute("data-ready", "true");
  await page.setViewportSize({ width: 1440, height: 1080 });
  await schedule.evaluate((field) => field.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: "../../docs/qa/shift-import-mapped.png" });
  await submit.click();

  await page.getByRole("button", { name: /Investigar MAP-31/ }).click();
  const evidence = page.getByRole("region", { name: "Evidências da saída selecionada" });
  await expect(evidence.getByText("Com atraso", { exact: true })).toBeVisible();
  await expect(evidence.getByText(/Passagem de 00127 · P-02/)).toBeVisible();
  await expect(evidence.getByText(/06:08/)).toBeVisible();
  await expect(evidence.getByText(/Terminal;Expresso/)).toBeVisible();
  await expect(evidence.getByText(/P-01/)).toHaveCount(0);
});

test("saved shifts require consent, reopen with conclusions and can be deleted", async ({ page }) => {
  const schedule = csv(
    "arquivo-original-escala.csv",
    "trip_id,vehicle_id,planned_at,private_extra\n" +
      "ARQ-01,8 1776,2026-11-06T06:30:00-03:00,NAO-GUARDAR-ESTA-COLUNA\n",
  );
  const gate = csv(
    "arquivo-original-portaria.csv",
    "event_id,vehicle_id,observed_at,direction,trip_id\n" +
      "PG-01,8 1776,2026-11-06T06:38:00-03:00,OUT,ARQ-01\n",
  );
  const occurrence = page.getByRole("button", { name: /Investigar ARQ-01/ });
  const saved = page.getByRole("region", { name: "Turnos guardados" });
  const reopen = saved.getByRole("button", { name: /Reabrir turno/ });
  await openReview(page);
  await submitFiles(page, schedule, gate);
  await expect(occurrence).toBeVisible();
  await expect(reopen).toHaveCount(0);

  await openReview(page);
  await expect(occurrence).toHaveCount(0);
  await expect(reopen).toHaveCount(0);

  await submitFiles(page, schedule, gate);
  await occurrence.click();
  const conclusion = page.getByRole("textbox", { name: "Conclusão da ocorrência" });
  const note = "Conferência autorizada para guardar.";
  await conclusion.fill(note);
  await page.getByRole("button", { name: "Salvar conclusão" }).click();
  await page.getByRole("button", { name: "Guardar turno neste navegador" }).click();
  await expect(reopen).toHaveCount(1);
  expect(
    await page.evaluate(() => JSON.stringify(localStorage).includes("NAO-GUARDAR-ESTA-COLUNA")),
  ).toBe(false);
  expect(
    await page.evaluate(() => JSON.stringify(localStorage).includes("arquivo-original")),
  ).toBe(false);

  await openReview(page);
  await reopen.click();
  await occurrence.click();
  await expect(conclusion).toHaveValue(note);
  await expect(page.getByRole("button", { name: "Reabrir ocorrência" })).toBeVisible();

  await saved.getByRole("button", { name: /Excluir turno/ }).click();
  await saved.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(reopen).toHaveCount(0);

  await openReview(page);
  await expect(reopen).toHaveCount(0);
  await expect(occurrence).toHaveCount(0);
  await submitFiles(page, schedule, gate);
  await occurrence.click();
  await expect(conclusion).toHaveValue("");
});
