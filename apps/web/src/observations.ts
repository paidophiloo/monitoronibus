import { useEffect, useState } from "react";
import proj4 from "proj4";
import type { Vehicle } from "./fleet";

export type Mode = "DEMO" | "LIVE" | "REPLAY";
export type Area = {
  name: string;
  source: string;
  origin: [number, number];
  ring: [number, number][];
};
export type Observation = {
  vehicleId: string;
  lineId: number | null;
  lineLabel: string | null;
  latitude: number;
  longitude: number;
  observedAt: string;
  receivedAt: string;
};
export type Snapshot = {
  version: 1;
  mode: Exclude<Mode, "DEMO">;
  state: string;
  source?: "sptrans_olhovivo";
  area?: Area;
  range?: [string, string];
  at?: string;
  vehicles: Observation[];
};

const UTM_23S = "+proj=utm +zone=23 +south +datum=WGS84 +units=m +no_defs";
export function localPoint(
  origin: [number, number],
  coordinates: [number, number],
): [number, number] {
  const [east, north] = proj4("EPSG:4326", UTM_23S, origin);
  const [x, y] = proj4("EPSG:4326", UTM_23S, coordinates);
  return [x - east, north - y];
}

export function observedVehicles(snapshot?: Snapshot): Vehicle[] {
  if (!snapshot?.area || snapshot.source !== "sptrans_olhovivo") return [];
  return snapshot.vehicles.map((obs) => {
    const [x, z] = localPoint(snapshot.area!.origin, [
      obs.longitude,
      obs.latitude,
    ]);
    return {
      id: obs.vehicleId,
      line: obs.lineLabel ?? "Não informada",
      x,
      z,
      paint: "#268b6c",
      observation: obs,
    };
  });
}

type ObservationResult = {
  mode: Mode;
  data?: Snapshot;
  failed?: boolean;
  transport?: "websocket" | "http";
};

function validateSnapshot(value: unknown, mode: Mode): value is Snapshot {
  if (typeof value !== "object" || !value) return false;
  const snapshot = value as Partial<Snapshot>;
  return snapshot.version === 1 && snapshot.mode === mode &&
    typeof snapshot.state === "string" && Array.isArray(snapshot.vehicles) &&
    (snapshot.vehicles.length === 0 || snapshot.source === "sptrans_olhovivo");
}

export function useObservations(mode: Mode, at: string) {
  const [result, setResult] = useState<ObservationResult>();
  useEffect(() => {
    if (mode === "DEMO") return;
    let controller: AbortController | undefined;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined;
    let connected = false;
    let active = true;
    let retry = 2000;

    const refresh = async () => {
      const request = new AbortController();
      controller = request;
      const params = new URLSearchParams({ mode });
      if (mode === "REPLAY" && at) params.set("at", at);
      const deadline = setTimeout(() => request.abort(), 7000);
      try {
        const response = await fetch("/api/vehicles/snapshot?" + params, {
          signal: request.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Provider unavailable");
        const data: unknown = await response.json();
        if (!validateSnapshot(data, mode)) throw new Error("Invalid snapshot");
        if (active && !connected) setResult({ mode, data, transport: "http" });
      } catch {
        if (active && !connected) {
          setResult((previous) => ({
            mode,
            data: previous?.mode === mode ? previous.data : undefined,
            failed: true,
            transport: "http",
          }));
        }
      } finally {
        clearTimeout(deadline);
        if (controller === request) controller = undefined;
        if (active && mode === "LIVE" && !connected) pollTimer = setTimeout(refresh, 8000);
      }
    };

    function connect() {
      const url = new URL("/api/vehicles/live", window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const connection = new WebSocket(url);
      socket = connection;
      const deadline = setTimeout(() => connection.close(), 10_000);
      connection.onmessage = (event) => {
        if (!active || socket !== connection) return;
        try {
          if (typeof event.data !== "string" || event.data.length > 4_000_000) {
            throw new Error("Invalid live message");
          }
          const data: unknown = JSON.parse(event.data);
          if (!validateSnapshot(data, "LIVE")) throw new Error("Invalid live snapshot");
          connected = true;
          retry = 2000;
          clearTimeout(deadline);
          clearTimeout(pollTimer);
          setResult({ mode, data, transport: "websocket" });
        } catch {
          connection.close();
        }
      };
      connection.onerror = () => connection.close();
      connection.onclose = () => {
        clearTimeout(deadline);
        if (!active || socket !== connection) return;
        const wasConnected = connected;
        connected = false;
        if (wasConnected) {
          setResult((previous) => previous?.mode === mode ? { ...previous, failed: true } : previous);
          clearTimeout(pollTimer);
          if (!controller) void refresh();
        }
        reconnectTimer = setTimeout(connect, retry);
        retry = Math.min(retry * 2, 30_000);
      };
    }

    void refresh();
    if (mode === "LIVE") connect();
    return () => {
      active = false;
      controller?.abort();
      clearTimeout(pollTimer);
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [mode, at]);
  return result?.mode === mode ? result : undefined;
}
