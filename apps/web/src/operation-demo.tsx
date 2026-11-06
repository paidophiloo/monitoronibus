import { useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, BusFront, Pause, Play, RotateCcw } from "lucide-react";
import { fleet } from "./fleet";
import { sampleSimulation, SIMULATION_DURATION, simulationEventsAt } from "./simulation";
import "./operation-demo.css";

export const simulationPhaseLabel = {
  parked: "Na baia",
  departing: "Em saída",
  away: "Fora do pátio",
  arriving: "Em chegada",
} as const;

function clockLabel(seconds: number) {
  const elapsed = Math.floor(seconds);
  return `06:${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
}

export function useDemoOperation(enabled: boolean) {
  const clock = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(() =>
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const running = enabled && playing && elapsed < SIMULATION_DURATION;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    function pauseForPreference(event: MediaQueryListEvent) {
      if (event.matches) setPlaying(false);
    }
    preference.addEventListener("change", pauseForPreference);
    return () => preference.removeEventListener("change", pauseForPreference);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setElapsed(clock.current), 200);
    return () => window.clearInterval(timer);
  }, [running]);

  function seek(next: number) {
    clock.current = next;
    setElapsed(next);
    setPlaying(false);
  }

  function toggle() {
    if (running) {
      setElapsed(clock.current);
      setPlaying(false);
    } else {
      if (clock.current >= SIMULATION_DURATION) {
        clock.current = 0;
        setElapsed(0);
      }
      setPlaying(true);
    }
  }

  return {
    elapsed, running, speed, setSpeed, seek, toggle,
    scene: { running, speed, elapsed: clock },
  };
}

type Operation = ReturnType<typeof useDemoOperation>;

export function SimulationControls({ operation }: { operation: Operation }) {
  const { elapsed, running, speed, setSpeed, seek, toggle } = operation;
  return (
    <section className="simulation-hud" aria-label="Simulação do pátio">
      <div className="simulation-hud-top">
        <span className="simulation-chip" data-running={running}>
          <i /> SIMULAÇÃO
        </span>
        <time className="simulation-clock">{clockLabel(elapsed)}</time>
        <label className="simulation-speed">
          <select aria-label="Velocidade da simulação" value={speed} onChange={(event) => setSpeed(Number(event.currentTarget.value))}>
            <option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option>
          </select>
        </label>
      </div>
      <div className="simulation-hud-bottom">
        <button type="button" aria-label={running ? "Pausar simulação" : "Reproduzir simulação"} onClick={toggle}>
          {running ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <input type="range" aria-label="Tempo da simulação" aria-valuetext={clockLabel(elapsed)}
          min={0} max={SIMULATION_DURATION} step={0.5} value={elapsed}
          onChange={(event) => seek(Number(event.currentTarget.value))} />
        <button type="button" aria-label="Reiniciar simulação" onClick={() => seek(0)}><RotateCcw size={16} /></button>
      </div>
    </section>
  );
}

export function OperationFeed({ elapsed }: { elapsed: number }) {
  const phases = fleet.map((vehicle) => sampleSimulation(vehicle, elapsed).phase);
  const parked = phases.filter((phase) => phase === "parked").length;
  const away = phases.filter((phase) => phase === "away").length;
  const events = simulationEventsAt(elapsed).slice(-3).reverse();

  return (
    <section className="operation-feed" aria-label="Movimentos do pátio">
      <header>
        <span className="eyebrow">DIÁRIO DE OPERAÇÃO</span>
        <span className="operation-source">DEMO</span>
      </header>
      <h2>Movimentos do pátio</h2>
      <dl className="operation-counts">
        <div><dt>Em baia</dt><dd>{parked}</dd></div>
        <div><dt>Em manobra</dt><dd>{fleet.length - parked - away}</dd></div>
        <div><dt>Fora</dt><dd>{away}</dd></div>
      </dl>
      {events.length ? <ol className="operation-events">
        {events.map((event) => (
          <li key={event.id}>
            <span className="operation-event-icon" data-kind={event.kind}>
              {event.kind === "arrival" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
            </span>
            <div><strong>{event.kind === "arrival" ? "Entrada na portaria" : "Saída pela portaria"}</strong><small>Ônibus {event.vehicleId}</small></div>
            <time>{clockLabel(event.at)}</time>
          </li>
        ))}
      </ol> : <p className="operation-empty"><BusFront size={15} /> Aguardando a primeira passagem simulada.</p>}
    </section>
  );
}
