import { Columns3, Sparkles } from "lucide-react";
import { useId } from "react";
import {
  suggestGateMapping,
  suggestScheduleMapping,
  type GateColumns,
  type ScheduleColumns,
} from "./shift-engine";
import "./shift-import-mapping.css";

export type ShiftColumnMapping = Partial<ScheduleColumns & GateColumns>;

type ShiftImportMappingProps = {
  kind: "schedule" | "gate";
  columns: readonly string[];
  mapping: ShiftColumnMapping;
  onChange: (mapping: ShiftColumnMapping) => void;
  sample?: readonly (readonly string[])[];
  utcOffset?: string;
  onUtcOffsetChange?: (offset: string) => void;
};

type MappingField = {
  key: keyof ShiftColumnMapping;
  label: string;
  optional?: boolean;
};

const scheduleFields: readonly MappingField[] = [
  { key: "trip_id", label: "ID da saída" },
  { key: "vehicle_id", label: "Prefixo do veículo" },
  { key: "planned_at", label: "Horário programado" },
  { key: "route", label: "Linha", optional: true },
];

const gateFields: readonly MappingField[] = [
  { key: "event_id", label: "ID do registro" },
  { key: "vehicle_id", label: "Prefixo do veículo" },
  { key: "observed_at", label: "Horário da passagem" },
  { key: "direction", label: "Sentido da passagem" },
  { key: "trip_id", label: "ID da saída", optional: true },
];

const offsets = [
  { value: "-03:00", label: "UTC−03:00 · São Paulo, offset fixo" },
  { value: "-02:00", label: "UTC−02:00" },
  { value: "-04:00", label: "UTC−04:00" },
  { value: "-05:00", label: "UTC−05:00" },
  { value: "Z", label: "UTC±00:00" },
];

export function ShiftImportMapping({
  kind,
  columns,
  mapping,
  onChange,
  sample,
  utcOffset,
  onUtcOffsetChange,
}: ShiftImportMappingProps) {
  const helpId = useId();
  const schedule = kind === "schedule";
  const fields = schedule ? scheduleFields : gateFields;
  const proposed: ShiftColumnMapping = schedule
    ? suggestScheduleMapping([...columns])
    : suggestGateMapping([...columns]);
  const assigned = new Set(fields.map((field) => mapping[field.key]));
  const suggested = { ...mapping };
  let suggestionCount = 0;

  for (const { key } of fields) {
    const header = proposed[key];
    if (!mapping[key] && header && !assigned.has(header)) {
      suggested[key] = header;
      assigned.add(header);
      suggestionCount++;
    }
  }

  return (
    <fieldset className="shift-column-map">
      <legend>{schedule ? "Mapear colunas da escala" : "Mapear colunas da portaria"}</legend>
      <p className="shift-column-map-intro">
        <Columns3 size={14} aria-hidden="true" />
        Relacione cada campo ao cabeçalho original do arquivo.
      </p>
      {suggestionCount > 0 && (
        <button
          type="button"
          className="shift-column-suggestions"
          onClick={() => onChange(suggested)}
        >
          <Sparkles size={13} aria-hidden="true" /> Aplicar sugestões
        </button>
      )}
      <div className="shift-column-map-fields">
        {fields.map(({ key, label, optional }) => {
          const fieldLabel = optional ? label + " (opcional)" : label;
          const selected = mapping[key] ?? "";
          const columnIndex = columns.indexOf(selected);
          const example = columnIndex >= 0
            ? sample?.map((row) => row[columnIndex]).find((value) => value?.trim())
            : undefined;

          return (
            <label key={key} className="shift-column-field">
              <span>{fieldLabel}</span>
              <select
                aria-label={fieldLabel}
                aria-describedby={example ? helpId + "-" + key : undefined}
                value={selected}
                onChange={(event) =>
                  onChange({ ...mapping, [key]: event.currentTarget.value || undefined })
                }
              >
                <option value="">{optional ? "Ignorar este campo" : "Selecione uma coluna"}</option>
                {columns.map((header, index) => (
                  <option
                    key={header}
                    value={header}
                    disabled={header !== selected && fields.some((field) => mapping[field.key] === header)}
                  >
                    {header} · coluna {index + 1}
                  </option>
                ))}
              </select>
              {example && <small id={helpId + "-" + key} title={example}>Exemplo do arquivo: {example}</small>}
            </label>
          );
        })}
      </div>
      {onUtcOffsetChange && (
        <label className="shift-column-field shift-column-offset">
          <span>Fuso dos horários sem offset</span>
          <select
            aria-label="Fuso dos horários sem offset"
            aria-describedby={helpId + "-offset"}
            value={utcOffset ?? ""}
            onChange={(event) => onUtcOffsetChange(event.currentTarget.value)}
          >
            <option value="">Exigir offset no CSV</option>
            {offsets.map((offset) => (
              <option key={offset.value} value={offset.value}>{offset.label}</option>
            ))}
          </select>
          <small id={helpId + "-offset"}>
            Para datas DD/MM/AAAA sem fuso, escolha o offset registrado na operação.
            Horários com offset próprio mantêm o original.
          </small>
        </label>
      )}
    </fieldset>
  );
}
