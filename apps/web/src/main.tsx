import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./style.css";
import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  BusFront,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Crosshair,
  History,
  Layers3,
  List,
  MapPin,
  Minus,
  Plus,
  Radio,
  ScanLine,
  X,
} from "lucide-react";
import { fleet } from "./fleet";
import { Scene, type CameraAction } from "./scene";
import { ShiftReview } from "./shift-review";
import { OperationFeed, SimulationControls, simulationPhaseLabel, useDemoOperation } from "./operation-demo";
import { sampleSimulation } from "./simulation";

import { observedVehicles, useObservations, type Mode } from "./observations";

const readingTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "medium",
});

function SiteMap() {
  return (
    <svg
      viewBox="0 0 268 117"
      aria-label="Planta esquemática do cenário"
      role="img"
    >
      <rect width="268" height="117" fill="#e3e8df" />
      <path
        d="M-14 73 117 -13 290 53 M36 133 187 -12 M117 132 275 38 M-9 92 229 131"
        fill="none"
        stroke="#f6f8f2"
        strokeWidth="9"
      />
      <path
        d="M-22 104 130 1 273 69"
        fill="none"
        stroke="#bdccc0"
        strokeWidth="2"
      />
      <path
        d="M43 50 102 18 224 49 192 87 95 88Z"
        fill="#d0e5d8"
        stroke="#74a58a"
        strokeDasharray="4 3"
      />
      <path d="M67 51 101 33 147 45 112 66Z" fill="#9bb4a4" />
      <path
        d="m135 60 17 4m-20 2 17 4m-23 1 17 4m-23 2 17 4"
        stroke="#a2b6aa"
        strokeWidth="3"
      />
      <circle cx="164" cy="55" r="12" fill="#164d38" />
      <circle cx="164" cy="55" r="4" fill="#ebfff4" />
    </svg>
  );
}

function App() {
  const [mode, setMode] = useState<Mode>("DEMO");
  const [selected, setSelected] = useState<string | null>("8 2361");
  const [action, setAction] = useState<CameraAction>({ type: "home" });
  const [panel, setPanel] = useState<"overview" | "fleet" | "shift">(
    "overview",
  );
  const [help, setHelp] = useState(false);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const [failed3d, setFailed3d] = useState(false);
  const [at, setAt] = useState("");
  const onFailure = useCallback(() => setFailed3d(true), []);
  const result = useObservations(mode, at);
  const snapshot = result?.data;
  const area = snapshot?.area;
  const demo = mode === "DEMO";
  const vehicles = demo ? fleet : observedVehicles(snapshot);
  const site = demo ? "Pátio Leste" : (area?.name ?? "Área operacional");
  const noData = !demo && !vehicles.length;
  const vehicle = vehicles.find((item) => item.id === selected);
  const reviewing = panel === "shift";
  const operation = useDemoOperation(demo && !reviewing && ready && !failed3d);
  const demoPhase = demo && vehicle ? sampleSimulation(vehicle, operation.elapsed).phase : undefined;
  const reviewEntry = useRef<HTMLButtonElement>(null);
  const reviewRegion = useRef<HTMLElement>(null);
  useEffect(() => {
    if (reviewing) reviewRegion.current?.focus();
  }, [reviewing]);

  function closeReview() {
    setPanel("overview");
    reviewEntry.current?.focus();
  }

  function focusReviewVehicle(vehicleId: string) {
    const target = vehicles.find((item) => item.id === vehicleId);
    if (target) {
      setSelected(target.id);
      setAction({ type: "focus", vehicle: target });
    }
  }

  function chooseMode(next: Mode) {
    setMode(next);
    setAt("");
    setSelected(next === "DEMO" ? "8 2361" : null);
    setAction({ type: "home" });
  }
  return (
    <div className="app">
      <header className="topbar">
        <div className="identity">
          <div className="logo">
            <BusFront size={23} strokeWidth={2.2} />
          </div>
          <div>
            <div className="brand">Pátio Monitor</div>
            <div className="brand-caption">MOBILIDADE URBANA</div>
          </div>
        </div>
        <div className="location">
          <MapPin size={16} />
          <div>
            <strong>{site}</strong>
            <small>
              {demo
                ? "São Paulo · cenário ilustrativo"
                : "São Paulo · observações GPS"}
            </small>
          </div>
        </div>
        <div className="modes" aria-label="Modo de dados">
          {(["DEMO", "LIVE", "REPLAY"] as const).map((name) => (
            <button
              key={name}
              aria-pressed={mode === name}
              onClick={() => chooseMode(name)}
            >
              {mode === name && <i />}
              {name}
            </button>
          ))}
        </div>
        <button
          className="icon help"
          type="button"
          aria-label="Ajuda e origem dos dados"
          onClick={() => setHelp(true)}
        >
          <CircleHelp size={20} />
        </button>
      </header>
      <main className="layout">
        <nav className="rail" aria-label="Área de trabalho">
          <button
            className="icon"
            aria-label="Visão geral"
            aria-pressed={panel === "overview"}
            onClick={() => setPanel("overview")}
          >
            <Layers3 size={20} />
          </button>
          <button
            className="icon"
            aria-label={
              demo ? "Frota de demonstração" : "Observações de veículos"
            }
            aria-pressed={panel === "fleet"}
            onClick={() => setPanel("fleet")}
          >
            <List size={20} />
          </button>
          <button
            className="icon"
            ref={reviewEntry}
            aria-label="Fechamento de turno"
            title="Fechamento de turno"
            aria-pressed={reviewing}
            onClick={() => setPanel("shift")}
          >
            <ClipboardCheck size={20} />
          </button>
        </nav>
        <section
          className={reviewing ? "workspace workspace-review" : "workspace"}
          aria-label="Visão do pátio"
        >
          <div className="viewport" data-ready={ready}>
            <Scene
              vehicles={vehicles}
              selected={selected}
              onSelect={setSelected}
              action={action}
              onReady={onReady}
              onFailure={onFailure}
              demo={demo}
              area={area}
              simulation={demo ? operation.scene : undefined}
            />
            {!ready && !failed3d && (
              <div className="load-label" role="status">
                Iniciando cena WebGL…
              </div>
            )}
            <div className="scene-caption">
              <span className="eyebrow">
                <Layers3 size={13} /> VISÃO ESPACIAL
              </span>
              <h1>{site}</h1>
              <span>
                {demo
                  ? "Geometria ilustrativa · São Paulo"
                  : (area?.source ?? "Perímetro verificado indisponível")}
              </span>
            </div>
            {noData && (
              <div className="mode-notice" role="status">
                {mode === "LIVE" ? <Radio size={22} /> : <History size={22} />}
                <strong>
                  {mode === "LIVE"
                    ? snapshot?.state === "no_observations"
                      ? "Sem ônibus observados na área"
                      : "LIVE indisponível"
                    : "REPLAY sem registros"}
                </strong>
                <span>
                  {mode === "LIVE"
                    ? snapshot?.state === "no_observations"
                      ? "Consulta autenticada concluída. Nenhuma leitura dentro do perímetro."
                      : "A conexão autenticada com o Olho Vivo ainda não está disponível."
                    : "Nenhum histórico verificado foi carregado."}
                </span>
                <button onClick={() => chooseMode("DEMO")}>
                  Abrir demonstração <ChevronRight size={15} />
                </button>
              </div>
            )}
            {!failed3d && (
              <div className="camera" aria-label="Controles da câmera">
                <button
                  className="icon"
                  aria-label="Restaurar vista geral"
                  onClick={() => setAction({ type: "home" })}
                >
                  <Crosshair size={19} />
                </button>
                <button
                  className="icon"
                  aria-label="Aproximar câmera"
                  onClick={() => setAction({ type: "in" })}
                >
                  <Plus size={19} />
                </button>
                <button
                  className="icon"
                  aria-label="Afastar câmera"
                  onClick={() => setAction({ type: "out" })}
                >
                  <Minus size={19} />
                </button>
              </div>
            )}
            {demo && !reviewing && ready && !failed3d && <SimulationControls operation={operation} />}
            <div className="viewport-footer">
              <span className="view-mode">3D</span>
              <span>Arraste para girar · botão direito para deslocar</span>
            </div>
          </div>
          <aside
            className="side"
            aria-label="Painel de revisão"
            hidden={!reviewing}
            ref={reviewRegion}
            tabIndex={-1}
          >
            <ShiftReview
              key={mode}
              mode={mode}
              vehicles={vehicles}
              canFocusVehicle={ready && !failed3d}
              referenceAt={mode === "REPLAY" ? snapshot?.at : undefined}
              onFocusVehicle={focusReviewVehicle}
              onClose={closeReview}
            />
          </aside>
          <aside
            className="side"
            aria-label="Contexto do pátio"
            hidden={reviewing}
          >
            {demo && (
              <div className="map-card">
                <SiteMap />
                <div>
                  <MapPin size={15} />
                  <span>Planta ilustrativa</span>
                  <small>DEMO</small>
                </div>
              </div>
            )}
            {demo && <OperationFeed elapsed={operation.elapsed} />}
            <section className="info">
              <span className="eyebrow">
                {panel === "fleet" ? "VEÍCULOS DA CENA" : "VISÃO DO PÁTIO"}
              </span>
              <h2>
                {panel === "fleet"
                  ? demo
                    ? "Frota de demonstração"
                    : "Observações GPS"
                  : "Contexto operacional"}
              </h2>
              {demo || vehicles.length > 0 || snapshot?.range ? (
                <>
                  {panel === "overview" && (
                    <div className="overview">
                      <span className="soft-icon">
                        <BusFront size={20} />
                      </span>
                      <div>
                        <strong>{vehicles.length} veículos</strong>
                        <small>
                          {demo
                            ? "Frota do cenário DEMO"
                            : "Observações na área"}
                        </small>
                      </div>
                    </div>
                  )}
                  {(panel === "fleet" || failed3d || !demo) && (
                    <div className="vehicle-list">
                      {vehicles.map((item) => (
                        <button
                          key={item.id}
                          aria-pressed={selected === item.id}
                          onClick={() => setSelected(item.id)}
                        >
                          <BusFront size={16} />
                          <strong>{item.id}</strong>
                          <small>{item.line}</small>
                          <ChevronRight size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                  {vehicle && (
                    <div className="vehicle">
                      <div className="vehicle-heading">
                        <span className="eyebrow">VEÍCULO SELECIONADO</span>
                        <button
                          className="icon"
                          aria-label="Limpar seleção"
                          onClick={() => setSelected(null)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="vehicle-id">
                        <BusFront size={23} />
                        <strong>{vehicle.id}</strong>
                      </div>
                      <p>
                        Linha <span>{vehicle.line}</span>
                      </p>
                      {demo ? (
                        <>
                          {demoPhase === "parked" && <p>
                            Baia ilustrativa <span>{vehicle.bay}</span>
                          </p>}
                          <span className="status">
                            <ArrowDownRight size={14} />
                            {demoPhase ? simulationPhaseLabel[demoPhase] : vehicle.status} · DEMO
                          </span>
                        </>
                      ) : (
                        vehicle.observation && (
                          <>
                            <p>
                              Horário do GPS{" "}
                              <span>
                                {readingTime.format(
                                  new Date(vehicle.observation.observedAt),
                                )}
                              </span>
                            </p>
                            <p>
                              Recepção{" "}
                              <span>
                                {readingTime.format(
                                  new Date(vehicle.observation.receivedAt),
                                )}
                              </span>
                            </p>
                            <p>
                              Posição GPS{" "}
                              <span>
                                {vehicle.observation.latitude.toFixed(5)},{" "}
                                {vehicle.observation.longitude.toFixed(5)}
                              </span>
                            </p>
                            <p>
                              Orientação da malha <span>Ilustrativa</span>
                            </p>
                            {mode === "LIVE" &&
                              (result?.failed ||
                                Date.now() -
                                  Date.parse(vehicle.observation.observedAt) >
                                  90000) && (
                                <span className="status stale">
                                  Leitura desatualizada
                                </span>
                              )}
                          </>
                        )
                      )}
                      <button
                        disabled={failed3d}
                        className="focus"
                        onClick={() => setAction({ type: "focus", vehicle })}
                      >
                        <ScanLine size={16} /> Focar veículo{" "}
                        <ChevronRight size={15} />
                      </button>
                      <div
                        className="inspection"
                        aria-label="Vistas do veículo"
                      >
                        <button
                          disabled={failed3d}
                          onClick={() =>
                            setAction({ type: "profile", vehicle })
                          }
                        >
                          Perfil
                        </button>
                        <button
                          disabled={failed3d}
                          onClick={() => setAction({ type: "top", vehicle })}
                        >
                          Superior
                        </button>
                      </div>
                    </div>
                  )}
                  {mode === "REPLAY" && snapshot?.range && (
                    <label className="replay">
                      <span>
                        {snapshot.at
                          ? readingTime.format(new Date(snapshot.at))
                          : "Horário do registro"}
                      </span>
                      <input
                        type="range"
                        aria-label="Horário do replay"
                        min={Date.parse(snapshot.range[0])}
                        max={Date.parse(snapshot.range[1])}
                        step={1000}
                        value={
                          at
                            ? Date.parse(at)
                            : Date.parse(snapshot.at ?? snapshot.range[1])
                        }
                        onChange={(event) =>
                          setAt(
                            new Date(
                              Number(event.currentTarget.value),
                            ).toISOString(),
                          )
                        }
                      />
                    </label>
                  )}
                </>
              ) : (
                <p className="quiet">
                  Nenhuma observação disponível para este modo.
                </p>
              )}
            </section>
            <button
              className="shift-entry"
              aria-label="Revisar turno"
              onClick={() => setPanel("shift")}
            >
              <ClipboardCheck size={19} />
              <span>
                <strong>Revisar turno</strong>
                <small>Compare escala e registros de portaria</small>
              </span>
              <ChevronRight size={16} />
            </button>
            <div className="provenance">
              <Clock3 size={15} />
              <div>
                <strong>
                  {mode === "DEMO"
                    ? "Dados sintéticos"
                    : result?.failed ||
                        snapshot?.state === "stale" ||
                        snapshot?.state === "unavailable"
                      ? "Conexão indisponível ou leitura antiga"
                      : vehicles.length
                        ? "SPTrans Olho Vivo"
                        : "Sem observações"}
                </strong>
                <small>
                  {mode === "DEMO"
                    ? "Sem horário de GPS real"
                    : result?.transport === "websocket" && !result.failed
                      ? "SPTrans Olho Vivo · canal WebSocket"
                      : "SPTrans Olho Vivo · consulta HTTP"}
                </small>
              </div>
            </div>
          </aside>
        </section>
      </main>
      <footer className="bottom">
        <span>
          <i />
          {mode === "DEMO"
            ? "DEMO · Dados simulados"
            : mode === "LIVE"
              ? result?.failed ||
                snapshot?.state === "stale" ||
                snapshot?.state === "unavailable"
                ? "LIVE · Dados indisponíveis ou antigos"
                : snapshot?.state === "connected"
                  ? "LIVE · GPS observado"
                  : "LIVE · Sem observações"
              : snapshot?.range
                ? "REPLAY · Histórico verificado"
                : "REPLAY · Sem registros"}
        </span>
        <span>Visualização de mobilidade · São Paulo/SP</span>
      </footer>
      {help && (
        <dialog open aria-labelledby="help-title" className="help-dialog">
          <button
            className="icon close"
            aria-label="Fechar ajuda"
            onClick={() => setHelp(false)}
          >
            <X size={20} />
          </button>
          <h2 id="help-title">Origem dos dados</h2>
          <p>
            <strong>DEMO</strong> simula manobras e passagens na portaria.{" "}
            <strong>LIVE</strong> exige observações autenticadas da SPTrans.{" "}
            <strong>REPLAY</strong> exige histórico registrado e verificado.
          </p>
          <p>
            Use os botões da câmera, arraste o pátio ou escolha um veículo na
            lista.
          </p>
        </dialog>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
