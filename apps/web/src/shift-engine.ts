export type ShiftStatus = "on_time" | "late" | "unconfirmed" | "divergent";

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  on_time: "No horário",
  late: "Com atraso",
  unconfirmed: "Sem confirmação",
  divergent: "Dados divergentes",
};

export const SHIFT_TOLERANCE_MINUTES = 5;
export const SHIFT_GATE_WINDOW_MINUTES = { before: 15, after: 60 } as const;
export const SHIFT_EXPLICIT_WINDOW_MINUTES = { before: 60, after: 180 } as const;
export const SHIFT_MAX_SPAN_HOURS = 24;
export const SHIFT_MAX_CSV_LENGTH = 2_000_000;
const MAX_DATA_ROWS = 2_000;
const MINUTE = 60_000;

export interface ScheduleRow {
  tripId: string;
  vehicleId: string;
  plannedAt: string;
  route?: string;
}

export interface GateRow {
  eventId: string;
  vehicleId: string;
  observedAt: string;
  direction: "IN" | "OUT";
  tripId?: string;
}

export interface ShiftCase {
  trip: ScheduleRow;
  status: ShiftStatus;
  gate?: GateRow;
  candidates: GateRow[];
  reason: "confirmed" | "vehicle_swap" | "ambiguous" | "missing_gate" | "early_gate" | "outside_window";
  delayMinutes?: number;
  match?: "explicit" | "vehicle_time";
}

export interface ShiftDecision {
  outcome: "resolved" | "pending";
  note: string;
}

export interface ScheduleColumns {
  trip_id: string;
  vehicle_id: string;
  planned_at: string;
  route?: string;
}

export interface GateColumns {
  event_id: string;
  vehicle_id: string;
  observed_at: string;
  direction: string;
  trip_id?: string;
}

interface MappedCsvOptions<Columns> {
  columns: Partial<Columns>;
  utcOffset?: string;
}

const SCHEDULE_REQUIRED = ["trip_id", "vehicle_id", "planned_at"] as const;
const GATE_REQUIRED = ["event_id", "vehicle_id", "observed_at", "direction"] as const;
const VEHICLE_ALIASES = [
  "veiculo", "id_veiculo", "id_do_veiculo", "codigo_veiculo", "prefixo",
  "prefixo_veiculo", "prefixo_do_veiculo", "numero_veiculo",
];
const TRIP_ALIASES = ["viagem", "id_viagem", "id_da_viagem", "codigo_viagem", "numero_viagem"];
const SCHEDULE_ALIASES: Record<keyof ScheduleColumns, readonly string[]> = {
  trip_id: TRIP_ALIASES,
  vehicle_id: VEHICLE_ALIASES,
  planned_at: [
    "saida_prevista", "saida_planejada", "horario_previsto", "horario_planejado",
    "data_hora_prevista", "data_hora_planejada",
  ],
  route: ["linha", "codigo_linha", "rota"],
};
const GATE_ALIASES: Record<keyof GateColumns, readonly string[]> = {
  event_id: ["evento", "id_evento", "codigo_evento", "id_registro", "codigo_registro", "registro"],
  vehicle_id: VEHICLE_ALIASES,
  observed_at: [
    "data_hora", "data_e_hora", "data_hora_evento", "data_hora_registro",
    "data_hora_passagem", "data_hora_da_passagem", "horario_registro",
    "hora_registro", "horario_passagem", "hora_passagem", "horario_evento",
  ],
  direction: ["direcao", "sentido", "movimento", "tipo_movimento", "tipo_de_movimento", "entrada_saida"],
  trip_id: TRIP_ALIASES,
};

function detectDelimiter(text: string): "," | ";" {
  let quoted = false;
  let commas = 0;
  let semicolons = 0;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    if (quoted) continue;
    if (char === "\r" || char === "\n") break;
    if (char === ",") commas++;
    if (char === ";") semicolons++;
  }
  return semicolons > commas ? ";" : ",";
}

function parseCsv(text: string): string[][] {
  if (text.length > SHIFT_MAX_CSV_LENGTH) {
    throw new Error("O arquivo CSV excede o tamanho aceito.");
  }

  const data = text.replace(/^\uFEFF/, "").replace(/^(?:[ \t]*(?:\r\n|\r|\n))+/, "");
  const delimiter = detectDelimiter(data);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;

  function finishField() {
    row.push(field);
    field = "";
    closed = false;
  }

  function finishRow() {
    finishField();
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    if (rows.length > MAX_DATA_ROWS + 1) {
      throw new Error(`O CSV deve ter até ${MAX_DATA_ROWS} registros.`);
    }
    row = [];
  }

  for (let index = 0; index < data.length; index++) {
    const char = data[index];
    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (data[index + 1] === '"') {
        field += char;
        index++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (char === delimiter) {
      finishField();
    } else if (char === "\r" || char === "\n") {
      finishRow();
      if (char === "\r" && data[index + 1] === "\n") index++;
    } else if (closed && (char === " " || char === "\t")) {
      continue;
    } else if (char === '"' && field === "" && !closed) {
      quoted = true;
    } else if (char === '"' || closed) {
      throw new Error(`Aspas inválidas no registro ${rows.length + 1} do CSV.`);
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error(`Aspas abertas no registro ${rows.length + 1} do CSV.`);
  if (field || row.length || closed) finishRow();
  return rows;
}

type CsvFields = (column: string) => string;

function csvTable(text: string) {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error("O CSV está vazio.");
  const headers = header.map((value) => value.trim());
  const normalized = new Set(headers.map((name) => name.toLowerCase()));
  if (normalized.size !== headers.length || normalized.has("")) {
    throw new Error("O cabeçalho contém colunas duplicadas ou sem nome.");
  }
  return { headers, rows };
}

function validateRowWidth(values: string[], headers: string[], record: number) {
  if (values.length !== headers.length) {
    throw new Error(`Registro ${record}: quantidade de campos diferente do cabeçalho.`);
  }
}

export function inspectShiftCsv(text: string): { headers: string[]; sample: string[][]; rowCount: number } {
  const { headers, rows } = csvTable(text);
  rows.forEach((values, index) => validateRowWidth(values, headers, index + 2));
  return { headers, sample: rows.slice(0, 3), rowCount: rows.length };
}

function foldLabel(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function normalizeLabel(value: string): string {
  return foldLabel(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function suggestMapping<Key extends string>(
  headers: readonly string[],
  aliases: Record<Key, readonly string[]>,
): Partial<Record<Key, string>> {
  const suggestion: Partial<Record<Key, string>> = {};
  const normalized = headers.map(normalizeLabel);
  for (const key of Object.keys(aliases) as Key[]) {
    const exact = headers.find((header) => header.trim().toLowerCase() === key);
    if (exact) {
      suggestion[key] = exact;
      continue;
    }
    const candidates = headers.filter((_, index) =>
      normalized[index] === key || aliases[key].includes(normalized[index]),
    );
    if (candidates.length === 1) suggestion[key] = candidates[0];
  }
  return suggestion;
}

export function suggestScheduleMapping(headers: readonly string[]): Partial<ScheduleColumns> {
  return suggestMapping(headers, SCHEDULE_ALIASES);
}

export function suggestGateMapping(headers: readonly string[]): Partial<GateColumns> {
  return suggestMapping(headers, GATE_ALIASES);
}

function readTable<Row>(
  text: string,
  required: readonly string[],
  read: (get: CsvFields, row: number) => Row,
  mapping?: Readonly<Record<string, string | undefined>>,
): Row[] {
  const { headers, rows } = csvTable(text);
  const indexes = new Map<string, number>();
  if (mapping) {
    const mappedIndexes = new Set<number>();
    for (const [field, header] of Object.entries(mapping)) {
      if (!header) continue;
      const index = headers.indexOf(header);
      if (index < 0) throw new Error(`A coluna selecionada para ${field} não existe: ${header}.`);
      if (mappedIndexes.has(index)) throw new Error(`Cada campo precisa de uma coluna distinta: ${header}.`);
      mappedIndexes.add(index);
      indexes.set(field, index);
    }
  } else {
    headers.forEach((header, index) => indexes.set(header.toLowerCase(), index));
  }

  const missing = required.filter((name) => !indexes.has(name));
  if (missing.length) {
    const message = mapping ? "Selecione as colunas obrigatórias" : "Colunas obrigatórias ausentes";
    throw new Error(`${message}: ${missing.join(", ")}.`);
  }

  return rows.map((values, index) => {
    const record = index + 2;
    validateRowWidth(values, headers, record);
    return read((name) => (values[indexes.get(name) ?? -1] ?? "").trim(), record);
  });
}

function identifier(value: string, column: string, record: number): string {
  if (!value || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error(`Registro ${record}: informe um identificador válido em ${column}.`);
  }
  return value;
}

function timestamp(value: string, column: string, record: number, localClock?: { utcOffset?: string }): string {
  if (localClock) {
    const brazilian = /^(\d{2})\/(\d{2})\/(\d{4})[ \t]+(\d{2}:\d{2})(?::(\d{2}))?$/.exec(value);
    if (brazilian) {
      const { utcOffset } = localClock;
      if (!utcOffset) {
        throw new Error(`Registro ${record}: selecione um fuso explícito para a data brasileira em ${column}.`);
      }
      const [, day, month, year, hourMinute, second = "00"] = brazilian;
      value = `${year}-${month}-${day}T${hourMinute}:${second}${utcOffset}`;
    }
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (match) {
    const [, year, month, day, hour, minute, second = "0", zone] = match;
    const yearNumber = Number(year);
    const monthNumber = Number(month);
    const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (yearNumber % 4 === 0 && (yearNumber % 100 !== 0 || yearNumber % 400 === 0)) {
      monthDays[1] = 29;
    }
    const validZone = zone === "Z" || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4)) <= 59);
    if (
      Number(day) >= 1 &&
      Number(day) <= monthDays[monthNumber - 1] &&
      Number(hour) <= 23 &&
      Number(minute) <= 59 &&
      Number(second) <= 59 &&
      validZone &&
      Number.isFinite(Date.parse(value))
    ) {
      return value;
    }
  }

  throw new Error(`Registro ${record}: ${column} deve usar ISO 8601 com fuso explícito (Z ou -03:00).`);
}

function validateUtcOffset(utcOffset: string | undefined) {
  if (utcOffset !== undefined && !/^(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/.test(utcOffset)) {
    throw new Error("O fuso para datas brasileiras deve ser Z ou um deslocamento explícito como -03:00.");
  }
}

function validateUniqueId(seen: Set<string>, id: string, column: string, record: number) {
  if (seen.has(id)) throw new Error(`Registro ${record}: ${column} duplicado (${id}).`);
  seen.add(id);
}

export function parseScheduleCsv(text: string, options?: MappedCsvOptions<ScheduleColumns>): ScheduleRow[] {
  validateUtcOffset(options?.utcOffset);
  const seen = new Set<string>();
  const rows = readTable(text, SCHEDULE_REQUIRED, (get, record) => {
    const tripId = identifier(get("trip_id"), "trip_id", record);
    validateUniqueId(seen, tripId, "trip_id", record);
    return {
      tripId,
      vehicleId: identifier(get("vehicle_id"), "vehicle_id", record),
      plannedAt: timestamp(get("planned_at"), "planned_at", record, options),
      route: get("route") || undefined,
    };
  }, options ? { ...options.columns } : undefined);
  if (!rows.length) throw new Error("A escala precisa ter pelo menos uma saída planejada.");
  const times = rows.map(({ plannedAt }) => Date.parse(plannedAt));
  if (Math.max(...times) - Math.min(...times) >= SHIFT_MAX_SPAN_HOURS * 60 * MINUTE) {
    throw new Error(`A escala deve conter um único turno, com menos de ${SHIFT_MAX_SPAN_HOURS} horas.`);
  }
  return rows;
}

export function parseGateCsv(text: string, options?: MappedCsvOptions<GateColumns>): GateRow[] {
  validateUtcOffset(options?.utcOffset);
  const seen = new Set<string>();
  return readTable(text, GATE_REQUIRED, (get, record) => {
    const eventId = identifier(get("event_id"), "event_id", record);
    validateUniqueId(seen, eventId, "event_id", record);
    const inputDirection = get("direction");
    const label = options ? foldLabel(inputDirection) : "";
    const direction = label === "entrada" ? "IN" : label === "saida" ? "OUT" : inputDirection.toUpperCase();
    if (direction !== "IN" && direction !== "OUT") {
      const allowed = options ? "IN, OUT, Entrada ou Saída" : "IN ou OUT";
      throw new Error(`Registro ${record}: direction deve ser ${allowed}.`);
    }
    const tripId = get("trip_id");
    return {
      eventId,
      vehicleId: identifier(get("vehicle_id"), "vehicle_id", record),
      observedAt: timestamp(get("observed_at"), "observed_at", record, options),
      direction,
      tripId: tripId ? identifier(tripId, "trip_id", record) : undefined,
    };
  }, options ? { ...options.columns } : undefined);
}

function append<Key, Value>(index: Map<Key, Value[]>, key: Key, value: Value) {
  const existing = index.get(key);
  if (existing) existing.push(value);
  else index.set(key, [value]);
}

function withinWindow(delay: number, window: { before: number; after: number }): boolean {
  return delay >= -window.before * MINUTE && delay <= window.after * MINUTE;
}

function classify(
  trip: ScheduleRow,
  gate: GateRow,
  delay: number,
  match: NonNullable<ShiftCase["match"]>,
): ShiftCase {
  const evidence = { trip, gate, candidates: [gate], delayMinutes: delay / MINUTE, match };
  if (match === "explicit" && !withinWindow(delay, SHIFT_EXPLICIT_WINDOW_MINUTES)) {
    return { ...evidence, status: "divergent", reason: "outside_window" };
  }
  if (gate.vehicleId !== trip.vehicleId) {
    return { ...evidence, status: "divergent", reason: "vehicle_swap" };
  }
  if (delay < -SHIFT_TOLERANCE_MINUTES * MINUTE) {
    return { ...evidence, status: "divergent", reason: "early_gate" };
  }
  return {
    ...evidence,
    status: delay > SHIFT_TOLERANCE_MINUTES * MINUTE ? "late" : "on_time",
    reason: "confirmed",
  };
}

export function reconcileShift(schedule: ScheduleRow[], gate: GateRow[]): ShiftCase[] {
  const trips = schedule
    .map((row) => ({ row, time: Date.parse(row.plannedAt) }))
    .sort((a, b) => a.time - b.time);
  const exits = gate
    .filter((row) => row.direction === "OUT")
    .map((row) => ({ row, time: Date.parse(row.observedAt) }))
    .sort((a, b) => a.time - b.time);
  const exitsByTrip = new Map<string, typeof exits>();
  const unlinkedExitsByVehicle = new Map<string, typeof exits>();
  for (const exit of exits) {
    if (exit.row.tripId) append(exitsByTrip, exit.row.tripId, exit);
    else append(unlinkedExitsByVehicle, exit.row.vehicleId, exit);
  }

  const candidatesByTrip = new Map<string, typeof exits>();
  const candidateTripCounts = new Map<string, number>();
  for (const trip of trips) {
    const unlinked = unlinkedExitsByVehicle.get(trip.row.vehicleId) ?? [];
    const candidates = unlinked.filter(({ time }) =>
      withinWindow(time - trip.time, SHIFT_GATE_WINDOW_MINUTES),
    );
    candidatesByTrip.set(trip.row.tripId, candidates);
    for (const { row: candidate } of candidates) {
      candidateTripCounts.set(candidate.eventId, (candidateTripCounts.get(candidate.eventId) ?? 0) + 1);
    }
  }

  return trips.map(({ row: trip, time }): ShiftCase => {
    const exact = exitsByTrip.get(trip.tripId) ?? [];
    if (exact.length === 1) return classify(trip, exact[0].row, exact[0].time - time, "explicit");
    if (exact.length > 1) {
      return { trip, status: "divergent", reason: "ambiguous", candidates: exact.map(({ row }) => row) };
    }

    const candidates = candidatesByTrip.get(trip.tripId) ?? [];
    const [candidate] = candidates;
    if (!candidate) return { trip, status: "unconfirmed", reason: "missing_gate", candidates: [] };
    if (candidates.length === 1 && candidateTripCounts.get(candidate.row.eventId) === 1) {
      return classify(trip, candidate.row, candidate.time - time, "vehicle_time");
    }
    return { trip, status: "divergent", reason: "ambiguous", candidates: candidates.map(({ row }) => row) };
  });
}

function csvCell(value: string | number = ""): string {
  let text = String(value);
  if (typeof value === "string" && /^(?:[\t\r\n]|\s*[=+\-@＝＋－＠])/u.test(text)) {
    text = "'" + text;
  }
  return /[",;\t\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

export function exportShiftCsv(
  cases: ShiftCase[],
  decisions: Record<string, ShiftDecision> = {},
  origin: "DEMO" | "CSV_LOCAL" = "CSV_LOCAL",
): string {
  const header = [
    "trip_id", "vehicle_id", "route", "planned_at", "status", "reason",
    "gate_event_id", "gate_vehicle_id", "gate_observed_at", "gate_match", "delay_minutes",
    "candidate_gate_event_ids", "decision", "note", "candidate_gate_evidence", "data_origin",
  ];
  const records = cases.map(({ trip, status, reason, gate, match, delayMinutes, candidates }) => {
    const decision = Object.hasOwn(decisions, trip.tripId) ? decisions[trip.tripId] : undefined;
    return [
      trip.tripId, trip.vehicleId, trip.route, trip.plannedAt, status, reason,
      gate?.eventId, gate?.vehicleId, gate?.observedAt, match, delayMinutes,
      JSON.stringify(candidates.map(({ eventId }) => eventId)), decision?.outcome, decision?.note,
      JSON.stringify(candidates), origin,
    ].map((value) => csvCell(value)).join(",");
  });
  return "\uFEFF" + [header.join(","), ...records].join("\r\n") + "\r\n";
}
