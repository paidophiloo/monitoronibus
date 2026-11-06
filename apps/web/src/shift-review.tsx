import { useState, type FormEvent, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  BusFront,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Crosshair,
  FileUp,
  LogOut,
  Radio,
  X,
} from "lucide-react";
import type { Vehicle } from "./fleet";
import type { Mode } from "./observations";
import {
  DEMO_SHIFT_AT,
  DEMO_SHIFT_GPS,
  GATE_TEMPLATE,
  SCHEDULE_TEMPLATE,
  demoShift,
} from "./shift-demo";
import {
  SHIFT_STATUS_LABELS,
  SHIFT_TOLERANCE_MINUTES,
  exportShiftCsv,
  parseGateCsv,
  parseScheduleCsv,
  reconcileShift,
  type ShiftCase,
  type ShiftDecision,
  type ShiftStatus,
} from "./shift-engine";
import "./shift-review.css";

type ShiftReviewProps = {
  mode: Mode;
  vehicles: readonly Vehicle[];
  onFocusVehicle: (vehicleId: string) => void;
  onClose: () => void;
  canFocusVehicle?: boolean;
  referenceAt?: string;
};

type Dataset = {
  storageKey: string | null;
  cases: ShiftCase[];
  isDemo: boolean;
};

type Decisions = Record<string, ShiftDecision>;

const DEMO_DATASET: Dataset = {
  storageKey: "patio-monitor:shift-review:demo:v1",
  cases: demoShift,
  isDemo: true,
};
const NOTE_LIMIT = 600;
const FILE_LIMIT = 2 * 1024 * 1024;
const statusOrder: ShiftStatus[] = ["on_time", "late", "unconfirmed", "divergent"];
const priority: Record<ShiftStatus, number> = {
  divergent: 0,
  unconfirmed: 1,
  late: 2,
  on_time: 3,
};

const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});
const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function timestamp(value: string, full = false) {
  return (full ? dateTimeFormat : timeFormat).format(new Date(value));
}

function vehicleKey(id: string) {
  return /^\d[\d\s]*$/.test(id) ? id.replace(/\s/g, "") : id;
}

function hasSameVehicle(first: string, second: string) {
  return vehicleKey(first) === vehicleKey(second);
}

function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv.startsWith("\ufeff") ? csv : "\ufeff" + csv], {
    type: "text/csv;charset=utf-8",
  }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function datasetStorageKey(schedule: string, gate: string) {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify([schedule, gate]));
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return "patio-monitor:shift-review:import:v1:" + fingerprint;
  } catch {
    return null;
  }
}

function readDecisions(dataset: Dataset): { decisions: Decisions; available: boolean } {
  const decisions: Decisions = Object.create(null);
  if (!dataset.storageKey) return { decisions, available: false };
  try {
    const stored = JSON.parse(localStorage.getItem(dataset.storageKey) ?? "{}");
    for (const item of dataset.cases) {
      const value = stored?.[item.trip.tripId];
      if (item.status !== "on_time" &&
          (value?.outcome === "resolved" || value?.outcome === "pending") &&
          typeof value.note === "string") {
        decisions[item.trip.tripId] = {
          outcome: value.outcome,
          note: value.note.slice(0, NOTE_LIMIT),
        };
      }
    }
    return { decisions, available: true };
  } catch {
    return { decisions, available: false };
  }
}

function reason(item: ShiftCase) {
  switch (item.reason) {
    case "confirmed":
      return item.status === "late"
        ? "A portaria registrou a passagem depois da tolerância."
        : "A portaria registrou a passagem dentro da tolerância.";
    case "vehicle_swap":
      return "O veículo registrado na portaria difere do veículo da escala.";
    case "ambiguous":
      return "Há registros de portaria com mais de uma associação possível.";
    case "early_gate":
      return "A portaria registrou a passagem antes da tolerância.";
    case "outside_window":
      return "O registro vinculado está fora da janela de conciliação.";
    case "missing_gate":
      return "Aguardando evidência de passagem na portaria.";
  }
}

function StatusBadge({ status }: { status: ShiftStatus }) {
  return <span className="shift-badge" data-status={status}>{SHIFT_STATUS_LABELS[status]}</span>;
}

function EvidenceRow({ icon, name, children, at }: {
  icon: ReactNode;
  name: string;
  children: ReactNode;
  at?: string;
}) {
  return (
    <li className="shift-evidence">
      <span className="shift-evidence-icon" aria-hidden="true">{icon}</span>
      <div>
        <strong>{name}</strong>
        <span>{children}</span>
      </div>
      {at && <time dateTime={at}>{timestamp(at, true)}</time>}
    </li>
  );
}

function OccurrenceDetail({ item, decision, onDecision, sceneVehicle, gpsAt, gpsSource, stale, canFocusVehicle, onFocusVehicle }: {
  item: ShiftCase;
  decision?: ShiftDecision;
  onDecision: (decision: ShiftDecision) => void;
  sceneVehicle?: Vehicle;
  gpsAt?: string;
  gpsSource: string;
  stale: boolean;
  canFocusVehicle: boolean;
  onFocusVehicle: (id: string) => void;
}) {
  const [note, setNote] = useState(decision?.note ?? "");
  const resolved = decision?.outcome === "resolved";
  const canSave = Boolean(note.trim());

  function save(outcome: ShiftDecision["outcome"]) {
    onDecision({ outcome, note: note.trim() });
  }

  return (
    <section className="shift-detail" aria-label="Evidências da saída selecionada">
      <div className="shift-detail-title">
        <div>
          <span className="shift-kicker">EVIDÊNCIAS DA SAÍDA</span>
          <h3>{item.trip.tripId}</h3>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <p>{reason(item)}</p>
      {item.delayMinutes != null && (
        <span className="shift-offset">
          Diferença: {item.delayMinutes > 0 ? "+" : ""}{new Intl.NumberFormat("pt-BR", {
            maximumFractionDigits: 1,
          }).format(item.delayMinutes)} min
        </span>
      )}
      <ul className="shift-timeline">
        <EvidenceRow icon={<CalendarClock size={14} />} name="Escala" at={item.trip.plannedAt}>
          Veículo {item.trip.vehicleId}{item.trip.route ? ` · Linha ${item.trip.route}` : ""}
        </EvidenceRow>
        {item.gate ? (
          <EvidenceRow icon={<LogOut size={14} />} name="Portaria" at={item.gate.observedAt}>
            Passagem de {item.gate.vehicleId} · {item.gate.eventId}
          </EvidenceRow>
        ) : item.candidates.length ? (
          <>
            {item.candidates.slice(0, 3).map((candidate) => (
              <EvidenceRow key={candidate.eventId} icon={<LogOut size={14} />} name="Portaria · associação em análise" at={candidate.observedAt}>
                Veículo {candidate.vehicleId} · {candidate.eventId}
              </EvidenceRow>
            ))}
            {item.candidates.length > 3 && (
              <li className="shift-candidate-count">+{item.candidates.length - 3} registros candidatos</li>
            )}
          </>
        ) : (
          <EvidenceRow icon={<LogOut size={14} />} name="Portaria">
            Saída sem registro associado
          </EvidenceRow>
        )}
        <EvidenceRow icon={<Radio size={14} />} name={gpsSource} at={gpsAt}>
          {gpsAt ? stale ? "Posição desatualizada · evidência auxiliar" : "Última posição disponível · evidência auxiliar" : "Posição indisponível para esta saída"}
        </EvidenceRow>
      </ul>
      {item.match && (
        <p className="shift-match">
          {item.match === "explicit"
            ? "Vínculo por ID da saída."
            : "Vínculo por veículo e janela de horário."}
        </p>
      )}
      <p className="shift-match">A portaria registra a passagem pela garagem. O início da viagem em linha é outro evento.</p>
      {sceneVehicle && canFocusVehicle && (
        <button type="button" className="shift-button shift-locate" onClick={() => onFocusVehicle(sceneVehicle.id)}>
          <Crosshair size={15} /> Localizar no pátio <ArrowRight size={14} />
        </button>
      )}
      {item.status !== "on_time" && (
        <div className="shift-resolution">
          <label htmlFor="shift-conclusion">Conclusão da ocorrência</label>
          <textarea
            id="shift-conclusion"
            rows={2}
            placeholder="Registre a evidência revisada ou a ação tomada."
            value={note}
            maxLength={NOTE_LIMIT}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
          <div className="shift-resolution-actions">
            <button className="shift-button shift-primary" type="button" disabled={!canSave} onClick={() => save("resolved")}>
              <Check size={15} /> Salvar conclusão
            </button>
            <button className="shift-button shift-secondary" type="button" disabled={!resolved && !canSave} onClick={() => save("pending")}>
              {resolved ? "Reabrir ocorrência" : "Manter pendente"}
            </button>
          </div>
          {decision && (
            <div className="shift-decision" role="status">
              {resolved ? "Ocorrência concluída" : "Ocorrência mantida pendente"}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DatasetView({ dataset, mode, vehicles, onFocusVehicle, canFocusVehicle, referenceAt }: {
  dataset: Dataset;
  mode: Mode;
  vehicles: readonly Vehicle[];
  onFocusVehicle: (id: string) => void;
  canFocusVehicle: boolean;
  referenceAt?: string;
}) {
  const [review, setReview] = useState(() => readDecisions(dataset));
  const [all, setAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [exportFeedback, setExportFeedback] = useState(false);
  const counts = { on_time: 0, late: 0, unconfirmed: 0, divergent: 0 };
  const cases = [...dataset.cases].sort((first, second) => priority[first.status] - priority[second.status]);
  const exceptions = cases.filter((item) => item.status !== "on_time");
  const visible = all ? dataset.cases : exceptions;
  const selected = visible.find((item) => item.trip.tripId === selectedId) ?? visible[0];
  const spatial = dataset.isDemo || mode !== "DEMO";
  const vehicleFor = (item: ShiftCase) => {
    if (!spatial) return;
    const id = item.gate?.vehicleId ?? item.trip.vehicleId;
    return vehicles.find((vehicle) => hasSameVehicle(vehicle.id, id));
  };

  for (const item of dataset.cases) counts[item.status]++;
  const open = exceptions.filter((item) => review.decisions[item.trip.tripId]?.outcome !== "resolved").length;
  const selectedVehicle = selected ? vehicleFor(selected) : undefined;
  const reading = dataset.isDemo
    ? (selectedVehicle ? DEMO_SHIFT_GPS[selectedVehicle.id] : undefined)
    : selectedVehicle?.observation?.observedAt;
  const reviewAt = dataset.isDemo
    ? Date.parse(DEMO_SHIFT_AT)
    : mode === "LIVE" ? Date.now() : referenceAt ? Date.parse(referenceAt) : undefined;
  const stale = reading != null && reviewAt != null && reviewAt - Date.parse(reading) > 90_000;
  const dates = Array.from(new Set(dataset.cases.map((item) => dateFormat.format(new Date(item.trip.plannedAt)))));
  const dateLabel = dates.length === 1 ? dates[0] : `${dates[0]} a ${dates.at(-1)}`;

  function saveDecision(decision: ShiftDecision) {
    if (!selected) return;
    const decisions = { ...review.decisions, [selected.trip.tripId]: decision };
    let available = false;
    if (dataset.storageKey) {
      try {
        localStorage.setItem(dataset.storageKey, JSON.stringify(decisions));
        available = true;
      } catch {
        // Decisions remain available in this tab and can still be exported.
      }
    }
    setReview({ decisions, available });
  }

  return (
    <>
      <div className="shift-overview">
        <div className="shift-overview-heading">
          <span className="shift-kicker">{dataset.isDemo ? "TURNO DEMONSTRATIVO" : "ARQUIVOS LOCAIS"}</span>
          <span>{dateLabel} · horário de São Paulo</span>
        </div>
        <div className="shift-metrics" aria-label="Resumo da conciliação">
          {statusOrder.map((status) => (
            <div key={status} data-status={status}>
              <span>{SHIFT_STATUS_LABELS[status]}</span>
              <strong>{counts[status]}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="shift-worklist">
        <div className="shift-worklist-toolbar">
          <div className="shift-tabs" aria-label="Filtro de saídas">
            <button type="button" aria-pressed={!all} onClick={() => setAll(false)}>Ocorrências</button>
            <button type="button" aria-pressed={all} onClick={() => setAll(true)}>Todas as saídas</button>
          </div>
          <span className="shift-open-count">{open} em aberto</span>
        </div>
        {visible.length ? (
          <ul className="shift-case-list">
            {visible.map((item) => {
              const vehicle = vehicleFor(item);
              const resolved = review.decisions[item.trip.tripId]?.outcome === "resolved";
              return (
                <li key={item.trip.tripId}>
                  <button
                    type="button"
                    aria-label={`Investigar ${item.trip.tripId}, veículo ${item.trip.vehicleId}`}
                    aria-pressed={item === selected}
                    onClick={() => {
                      setSelectedId(item.trip.tripId);
                      if (vehicle && canFocusVehicle) onFocusVehicle(vehicle.id);
                    }}
                  >
                    <span className="shift-case-icon" aria-hidden="true">
                      {resolved ? <Check size={15} /> : <BusFront size={15} />}
                    </span>
                    <span className="shift-case-description">
                      <strong>{item.trip.tripId}</strong>
                      <span>{timestamp(item.trip.plannedAt)} · {item.trip.vehicleId}{resolved ? " · Concluída" : ""}</span>
                    </span>
                    <StatusBadge status={item.status} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="shift-empty-inline"><Check size={16} /> Nenhuma ocorrência para revisar neste turno.</p>
        )}
      </div>
      {selected && (
        <OccurrenceDetail
          key={selected.trip.tripId}
          item={selected}
          decision={review.decisions[selected.trip.tripId]}
          onDecision={saveDecision}
          sceneVehicle={selectedVehicle}
          gpsAt={reading}
          gpsSource={dataset.isDemo ? "GPS · demonstração" : reading ? "GPS · SPTrans Olho Vivo" : "GPS"}
          stale={stale}
          canFocusVehicle={canFocusVehicle}
          onFocusVehicle={onFocusVehicle}
        />
      )}
      <footer className="shift-footer">
        <button
          type="button"
          className="shift-button shift-export"
          disabled={!exceptions.length}
          onClick={() => {
            downloadCsv("patio-monitor-ocorrencias.csv", exportShiftCsv(exceptions, review.decisions, dataset.isDemo ? "DEMO" : "CSV_LOCAL"));
            setExportFeedback(true);
          }}
        >
          <ArrowDownToLine size={16} /> Exportar ocorrências
        </button>
        {exportFeedback && <span role="status">Arquivo de ocorrências preparado.</span>}
        <span>{review.available ? "As conclusões deste conjunto ficam neste navegador." : "Conclusões disponíveis nesta sessão. Exporte para guardar."}</span>
      </footer>
    </>
  );
}

export function ShiftReview({
  mode,
  vehicles,
  onFocusVehicle,
  onClose,
  canFocusVehicle = true,
  referenceAt,
}: ShiftReviewProps) {
  const [uploaded, setUploaded] = useState<Dataset>();
  const [pendingFiles, setPendingFiles] = useState<{ schedule?: File; gate?: File }>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const dataset = uploaded ?? (mode === "DEMO" ? DEMO_DATASET : undefined);

  async function importFiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { schedule, gate } = pendingFiles;
    if (busy || !schedule || !gate) return;
    setMessage("");
    setBusy(true);
    try {
      if (schedule.size > FILE_LIMIT || gate.size > FILE_LIMIT) {
        throw new Error("Use arquivos CSV de até 2 MB cada.");
      }
      const [scheduleText, gateText] = await Promise.all([schedule.text(), gate.text()]);
      let planned;
      try {
        planned = parseScheduleCsv(scheduleText);
      } catch (error) {
        throw new Error("Escala: " + (error instanceof Error ? error.message : "CSV inválido."));
      }
      let observed;
      try {
        observed = parseGateCsv(gateText);
      } catch (error) {
        throw new Error("Portaria: " + (error instanceof Error ? error.message : "CSV inválido."));
      }
      const cases = reconcileShift(planned, observed);
      const storageKey = await datasetStorageKey(scheduleText, gateText);
      setUploaded({ storageKey, cases, isDemo: false });
      setPendingFiles({});
      setRevision((previous) => previous + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao revisar os arquivos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="shift-review" aria-label="Revisão de saídas">
      <header className="shift-header">
        <div className="shift-header-mark" aria-hidden="true"><ClipboardCheck size={20} /></div>
        <div>
          <span className="shift-kicker">OPERAÇÃO DE GARAGEM</span>
          <h2>Fechamento de turno</h2>
        </div>
        <button className="shift-close" type="button" aria-label="Fechar revisão" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      <div className="shift-body">
        {dataset?.isDemo ? (
          <p className="shift-source-note"><span>DEMO</span> Escala, portaria e GPS simulados.</p>
        ) : dataset ? (
          <p className="shift-source-note"><span>CSV LOCAL</span> Escala e portaria fornecidas pelo usuário. {mode === "DEMO" && "A cena 3D permanece ilustrativa."}</p>
        ) : (
          <p className="shift-source-note">Carregue a escala e a portaria da mesma garagem e turno.</p>
        )}
        <details className="shift-import" key={uploaded ? revision : "import"} open={!dataset ? true : undefined}>
          <summary><FileUp size={16} /> Importar arquivos CSV <ChevronDown size={15} /></summary>
          <form onSubmit={importFiles}>
            <p>Selecione os dois CSV do mesmo turno. Use datas ISO 8601 com fuso horário.</p>
            <label className="shift-file">
              <span>Arquivo de escala</span>
              <input aria-label="Arquivo de escala" type="file" accept=".csv,text/csv"
                onChange={(event) => setPendingFiles({ ...pendingFiles, schedule: event.currentTarget.files?.[0] })}
              />
            </label>
            <label className="shift-file">
              <span>Arquivo de portaria</span>
              <input aria-label="Arquivo de portaria" type="file" accept=".csv,text/csv"
                onChange={(event) => setPendingFiles({ ...pendingFiles, gate: event.currentTarget.files?.[0] })}
              />
            </label>
            {message && <p className="shift-error" role="alert"><AlertCircle size={14} /> {message}</p>}
            <button className="shift-button shift-primary" type="submit" disabled={busy || !pendingFiles.schedule || !pendingFiles.gate}>
              {busy ? "Revisando…" : "Revisar arquivos"}
            </button>
            <div className="shift-templates">
              <button type="button" onClick={() => downloadCsv("modelo-escala.csv", SCHEDULE_TEMPLATE)}>Baixar exemplo de escala</button>
              <button type="button" onClick={() => downloadCsv("modelo-portaria.csv", GATE_TEMPLATE)}>Baixar exemplo de portaria</button>
            </div>
            <p className="shift-import-note"><Clock3 size={13} /> Tolerância de {SHIFT_TOLERANCE_MINUTES} min. Os arquivos são processados neste navegador.</p>
          </form>
        </details>
        {dataset && (
          <DatasetView
            key={dataset.isDemo ? "demo" : revision}
            dataset={dataset}
            mode={mode}
            vehicles={vehicles}
            onFocusVehicle={onFocusVehicle}
            canFocusVehicle={canFocusVehicle}
            referenceAt={referenceAt}
          />
        )}
        {uploaded && (
          <button type="button" className="shift-reset" onClick={() => { setUploaded(undefined); setPendingFiles({}); setMessage(""); }}>
            {mode === "DEMO" ? "Restaurar demonstração do turno" : "Remover arquivos da revisão"}
          </button>
        )}
      </div>
    </section>
  );
}
