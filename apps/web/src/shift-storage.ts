import { SHIFT_MAX_CSV_LENGTH, parseGateCsv, parseScheduleCsv, type GateRow, type ScheduleRow } from "./shift-engine";

const ARCHIVE_PREFIX = "patio-monitor:shift-archive:v1:";
const DECISION_PREFIX = "patio-monitor:shift-review:import:v1:";
const FINGERPRINT = /^[a-f0-9]{64}$/;

type StoredShift = {
  key: string;
  savedAt: string;
  plannedAt: string;
  count: number;
};

function archiveKey(key: string) {
  return ARCHIVE_PREFIX + key;
}

function storageRows(rows: (string | undefined)[][]) {
  return rows.map((row) => row.map((value) => '"' + (value ?? "").replaceAll('"', '""') + '"').join(",")).join("\n");
}

export function saveShift(key: string, schedule: ScheduleRow[], gate: GateRow[]) {
  if (!FINGERPRINT.test(key) || schedule.length === 0) {
    throw new Error("Este turno não pode ser guardado.");
  }
  const summary: StoredShift = {
    key,
    savedAt: new Date().toISOString(),
    plannedAt: schedule.reduce((earliest, row) =>
      Date.parse(row.plannedAt) < Date.parse(earliest) ? row.plannedAt : earliest, schedule[0].plannedAt),
    count: schedule.length,
  };
  // Rebuild the canonical CSVs from approved fields. Unmapped columns and
  // original filenames never enter storage.
  const scheduleCsv = storageRows([
    ["trip_id", "vehicle_id", "planned_at", "route"],
    ...schedule.map((row) => [row.tripId, row.vehicleId, row.plannedAt, row.route]),
  ]);
  const gateCsv = storageRows([
    ["event_id", "vehicle_id", "observed_at", "direction", "trip_id"],
    ...gate.map((row) => [row.eventId, row.vehicleId, row.observedAt, row.direction, row.tripId]),
  ]);
  if (scheduleCsv.length > SHIFT_MAX_CSV_LENGTH || gateCsv.length > SHIFT_MAX_CSV_LENGTH) {
    throw new Error("Este turno excede o tamanho aceito para armazenamento local.");
  }
  localStorage.setItem(archiveKey(key), JSON.stringify({ summary, scheduleCsv, gateCsv }));
}

export function savedShifts(): StoredShift[] {
  try {
    const entries: StoredShift[] = [];
    for (const storedKey of Object.keys(localStorage)) {
      if (!storedKey.startsWith(ARCHIVE_PREFIX)) continue;
      try {
        const record = JSON.parse(localStorage.getItem(storedKey) ?? "null");
        const summary = record?.summary;
        if (
          typeof summary?.key === "string" &&
          FINGERPRINT.test(summary.key) &&
          archiveKey(summary.key) === storedKey &&
          typeof summary.savedAt === "string" &&
          Number.isFinite(Date.parse(summary.savedAt)) &&
          typeof summary.plannedAt === "string" &&
          Number.isFinite(Date.parse(summary.plannedAt)) &&
          Number.isInteger(summary.count) && summary.count > 0
        ) entries.push(summary);
      } catch {
        // An unreadable record does not hide the other saved shifts.
      }
    }
    return entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
}

export function readSavedShift(key: string) {
  if (!FINGERPRINT.test(key)) throw new Error("Turno guardado inválido.");
  const value = JSON.parse(localStorage.getItem(archiveKey(key)) ?? "null");
  if (typeof value?.scheduleCsv !== "string" || typeof value?.gateCsv !== "string") {
    throw new Error("Este turno não está mais disponível neste navegador.");
  }
  return {
    schedule: parseScheduleCsv(value.scheduleCsv),
    gate: parseGateCsv(value.gateCsv),
    storageKey: DECISION_PREFIX + key,
  };
}

export function deleteSavedShift(key: string) {
  if (!FINGERPRINT.test(key)) throw new Error("Turno guardado inválido.");
  localStorage.removeItem(archiveKey(key));
  localStorage.removeItem(DECISION_PREFIX + key);
}
