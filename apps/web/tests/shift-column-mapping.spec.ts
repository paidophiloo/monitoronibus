import { expect, test } from "@playwright/test";
import {
  inspectShiftCsv,
  parseGateCsv,
  parseScheduleCsv,
  reconcileShift,
  suggestGateMapping,
  suggestScheduleMapping,
  type GateColumns,
  type ScheduleColumns,
} from "../src/shift-engine";

const scheduleColumns: ScheduleColumns = {
  trip_id: "Saída interna",
  vehicle_id: "Identificador da frota",
  planned_at: "Programada para",
  route: "Serviço",
};
const gateColumns: GateColumns = {
  event_id: "Chave da leitura",
  vehicle_id: "Prefixo capturado",
  observed_at: "Momento da cancela",
  direction: "Movimento",
  trip_id: "Saída interna",
};

const schedule =
  "\ufeffSaída interna;Identificador da frota;Programada para;Serviço\r\n" +
  'S-31;00127;06/11/2026 06:00;"Terminal;Expresso"\r\n';
const gate =
  "Chave da leitura;Prefixo capturado;Momento da cancela;Movimento;Saída interna\r\n" +
  "P-01;00127;06/11/2026 05:59;Entrada;S-31\r\n" +
  "P-02;00127;06/11/2026 06:08;Saída;S-31\r\n";

test("CSV inspection preserves the source columns and displays a sample without coercing prefix zeros", () => {
  expect(inspectShiftCsv(schedule)).toMatchObject({
    headers: Object.values(scheduleColumns),
    rowCount: 1,
    sample: [["S-31", "00127", "06/11/2026 06:00", "Terminal;Expresso"]],
  });
});

test("explicit mappings reconcile Portuguese records using the selected source offset", () => {
  const planned = parseScheduleCsv(schedule, {
    columns: scheduleColumns,
    utcOffset: "-03:00",
  });
  const observed = parseGateCsv(gate, { columns: gateColumns, utcOffset: "-03:00" });
  expect(planned[0]).toMatchObject({
    tripId: "S-31",
    vehicleId: "00127",
    route: "Terminal;Expresso",
  });
  expect(Date.parse(planned[0].plannedAt)).toBe(Date.parse("2026-11-06T09:00:00Z"));
  expect(observed.map((row) => row.direction)).toEqual(["IN", "OUT"]);
  expect(reconcileShift(planned, observed)[0]).toMatchObject({
    status: "late",
    gate: { eventId: "P-02" },
    delayMinutes: 8,
  });
});

test("suggestions prefer a canonical header to its aliases, while manual mappings reject reused or absent columns", () => {
  expect(suggestScheduleMapping(["Prefixo", "vehicle_id"]).vehicle_id).toBe("vehicle_id");
  expect(suggestGateMapping(["Prefixo", "vehicle_id"]).vehicle_id).toBe("vehicle_id");
  expect(suggestScheduleMapping(["Prefixo", "Veículo"]).vehicle_id).toBeUndefined();
  expect(suggestGateMapping(["Prefixo", "Veículo"]).vehicle_id).toBeUndefined();
  expect(() =>
    parseScheduleCsv(schedule, {
      columns: { ...scheduleColumns, vehicle_id: scheduleColumns.trip_id },
      utcOffset: "-03:00",
    }),
  ).toThrow();
  expect(() =>
    parseGateCsv(gate, {
      columns: { ...gateColumns, direction: "Coluna inexistente" },
      utcOffset: "-03:00",
    }),
  ).toThrow();
});

test("mapped local times require a valid explicit offset and invalid rows are rejected", () => {
  expect(() => parseScheduleCsv(schedule, { columns: scheduleColumns })).toThrow();
  expect(() =>
    parseScheduleCsv(schedule, { columns: scheduleColumns, utcOffset: "+15:00" }),
  ).toThrow();
  expect(() =>
    parseScheduleCsv(schedule.replace("06/11/2026", "31/11/2026"), {
      columns: scheduleColumns,
      utcOffset: "-03:00",
    }),
  ).toThrow();
  expect(() =>
    parseGateCsv(gate.replace("Saída;S-31", "Indeterminado;S-31"), {
      columns: gateColumns,
      utcOffset: "-03:00",
    }),
  ).toThrow();
});

test("an ISO timestamp retains its own offset in a mapped CSV", () => {
  const [planned] = parseScheduleCsv(
    schedule.replace("06/11/2026 06:00", "2026-11-06T11:00:00+02:00"),
    { columns: scheduleColumns, utcOffset: "-03:00" },
  );
  expect(Date.parse(planned.plannedAt)).toBe(Date.parse("2026-11-06T09:00:00Z"));
});
