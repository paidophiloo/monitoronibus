import { expect, test } from "@playwright/test";
import {
  exportShiftCsv,
  parseGateCsv,
  parseScheduleCsv,
  reconcileShift,
  SHIFT_TOLERANCE_MINUTES,
  type GateRow,
  type ScheduleRow,
} from "../src/shift-engine";

function schedule(tripId: string, vehicleId: string, plannedAt: string): ScheduleRow {
  return { tripId, vehicleId, plannedAt };
}

function gate(
  eventId: string,
  vehicleId: string,
  observedAt: string,
  details: Pick<GateRow, "tripId" | "direction"> = { direction: "OUT" },
): GateRow {
  return { eventId, vehicleId, observedAt, ...details };
}

const time = (hhmm: string) => `2026-11-06T${hhmm}:00-03:00`;

test("CSV reader preserves quoted identifiers, leading zeros and zoned observations", () => {
  const [trip] = parseScheduleCsv(
    '\uFEFFtrip_id;vehicle_id;planned_at;route\r\n"T;1";00123;2026-11-06T06:00:00-03:00;"Linha ""Expresso"""\r\n',
  );
  expect(trip).toMatchObject({
    tripId: "T;1",
    vehicleId: "00123",
    route: 'Linha "Expresso"',
  });
  expect(Date.parse(trip.plannedAt)).toBe(Date.parse("2026-11-06T09:00:00Z"));

  const [record] = parseGateCsv(
    'event_id,vehicle_id,observed_at,direction,trip_id\n"evento,01",00123,2026-11-06T09:02:00Z,OUT,"T;1"\n',
  );
  expect(record).toMatchObject({
    eventId: "evento,01",
    vehicleId: "00123",
    direction: "OUT",
    tripId: "T;1",
  });
  expect(reconcileShift([trip], [record])[0]).toMatchObject({
    status: "on_time",
    delayMinutes: 2,
    match: "explicit",
  });
});

test("CSV reader rejects duplicate rows, malformed quoting, impossible dates and absent time zones", () => {
  const scheduleHeader = "trip_id,vehicle_id,planned_at\n";
  const gateHeader = "event_id,vehicle_id,observed_at,direction\n";
  expect(() =>
    parseScheduleCsv(scheduleHeader + "A,010,2026-11-06T06:00:00"),
  ).toThrow();
  expect(() =>
    parseScheduleCsv(scheduleHeader + "A,010,2026-02-30T06:00:00-03:00"),
  ).toThrow();
  expect(() =>
    parseScheduleCsv(scheduleHeader + 'A,"010,2026-11-06T06:00:00-03:00'),
  ).toThrow();
  expect(() =>
    parseScheduleCsv(scheduleHeader + `A,010,${time("06:00")}\nA,011,${time("06:10")}`),
  ).toThrow();
  expect(() =>
    parseGateCsv(gateHeader + `G1,010,${time("06:00")},OUT\nG1,011,${time("06:10")},IN`),
  ).toThrow();
  expect(() =>
    parseGateCsv(gateHeader + `G1,010,${time("06:00")},UNKNOWN`),
  ).toThrow();
  expect(() => parseScheduleCsv(scheduleHeader)).toThrow();
  expect(parseGateCsv(gateHeader)).toEqual([]);
});

test("schedule and gate reconcile exact departures by timestamp, with a five minute tolerance", () => {
  expect(SHIFT_TOLERANCE_MINUTES).toBe(5);
  const cases = reconcileShift(
    [
      schedule("LATE", "003", time("06:20")),
      schedule("ON", "002", time("06:10")),
      schedule("EARLY", "001", time("06:00")),
    ],
    [
      gate("G-EARLY", "001", time("05:54"), { direction: "OUT", tripId: "EARLY" }),
      gate("G-ON", "002", time("06:15"), { direction: "OUT", tripId: "ON" }),
      gate("G-LATE", "003", time("06:26"), { direction: "OUT", tripId: "LATE" }),
    ],
  );
  expect(cases).toMatchObject([
    { trip: { tripId: "EARLY" }, status: "divergent", reason: "early_gate", delayMinutes: -6 },
    { trip: { tripId: "ON" }, status: "on_time", reason: "confirmed", delayMinutes: 5 },
    { trip: { tripId: "LATE" }, status: "late", reason: "confirmed", delayMinutes: 6 },
  ]);
});

test("explicit vehicle swaps and duplicate departures surface as divergences", () => {
  const result = reconcileShift(
    [schedule("SWAP", "008", time("06:00")), schedule("DUP", "009", time("06:15"))],
    [
      gate("G-SWAP", "099", time("06:08"), { direction: "OUT", tripId: "SWAP" }),
      gate("G-DUP1", "009", time("06:16"), { direction: "OUT", tripId: "DUP" }),
      gate("G-DUP2", "009", time("06:17"), { direction: "OUT", tripId: "DUP" }),
    ],
  );
  expect(result).toMatchObject([
    { status: "divergent", reason: "vehicle_swap", gate: { vehicleId: "099" } },
    { status: "divergent", reason: "ambiguous", candidates: [{ eventId: "G-DUP1" }, { eventId: "G-DUP2" }] },
  ]);
});

test("fallback accepts only unique vehicle and time candidates, and gate entries cannot confirm a departure", () => {
  const trips = [
    schedule("AMB1", "008", time("06:00")),
    schedule("AMB2", "008", time("06:15")),
    schedule("ENTRY", "009", time("06:20")),
    schedule("FALLBACK", "010", time("06:25")),
    schedule("WRONG-TRIP", "011", time("06:30")),
  ];
  const result = reconcileShift(trips, [
    gate("G-AMB", "008", time("06:08")),
    gate("G-ENTRY", "009", time("06:20"), { direction: "IN", tripId: "ENTRY" }),
    gate("G-FALLBACK", "010", time("06:24")),
    gate("G-WRONG", "011", time("06:30"), { direction: "OUT", tripId: "OTHER" }),
  ]);
  expect(result).toMatchObject([
    { status: "divergent", reason: "ambiguous", candidates: [{ eventId: "G-AMB" }] },
    { status: "divergent", reason: "ambiguous", candidates: [{ eventId: "G-AMB" }] },
    { status: "unconfirmed", reason: "missing_gate" },
    { status: "on_time", reason: "confirmed", match: "vehicle_time", gate: { eventId: "G-FALLBACK" } },
    { status: "unconfirmed", reason: "missing_gate" },
  ]);
  expect(result[2].gate).toBeUndefined();
  expect(result[4].gate).toBeUndefined();
});

test("an overnight shift is valid but a cross-day export cannot be reviewed as one shift", () => {
  const header = "trip_id,vehicle_id,planned_at\n";
  const rows = parseScheduleCsv(
    header + "A,008,2026-11-06T23:58:00-03:00\nB,009,2026-11-07T00:03:00-03:00",
  );
  expect(rows).toHaveLength(2);
  expect(() =>
    parseScheduleCsv(
      header + "A,008,2026-11-06T06:00:00-03:00\nB,009,2026-11-07T09:00:00Z",
    ),
  ).toThrow();
});

test("an explicit ID from an incompatible time still needs investigation", () => {
  const [result] = reconcileShift(
    [schedule("A", "008", time("06:00"))],
    [gate("G-1", "008", time("09:01"), { direction: "OUT", tripId: "A" })],
  );
  expect(result).toMatchObject({
    status: "divergent",
    reason: "outside_window",
    delayMinutes: 181,
    gate: { eventId: "G-1" },
  });
});

test("export neutralizes spreadsheet formulas in CSV cells", () => {
  const tripId = "=1+1";
  const cases = reconcileShift([schedule(tripId, "010", time("06:00"))], []);
  const csv = exportShiftCsv(cases, {
    [tripId]: { outcome: "resolved", note: '@HYPERLINK("example")' },
  });
  expect(csv).toContain("'=1+1");
  expect(csv).toContain("'@HYPERLINK");
});
