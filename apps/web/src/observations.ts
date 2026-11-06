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

export function useObservations(mode: Mode, at: string) {
  const [result, setResult] = useState<{
    mode: Mode;
    data?: Snapshot;
    failed?: boolean;
  }>();
  useEffect(() => {
    if (mode === "DEMO") return;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const refresh = async () => {
      controller = new AbortController();
      const params = new URLSearchParams({ mode });
      if (mode === "REPLAY" && at) params.set("at", at);
      const deadline = setTimeout(() => controller?.abort(), 7000);
      try {
        const response = await fetch("/api/vehicles/snapshot?" + params, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Provider unavailable");
        const data: Snapshot = await response.json();
        if (
          data.version !== 1 ||
          data.mode !== mode ||
          !Array.isArray(data.vehicles)
        )
          throw new Error("Invalid snapshot");
        if (active) setResult({ mode, data });
      } catch {
        if (active)
          setResult((previous) => ({
            mode,
            data: previous?.mode === mode ? previous.data : undefined,
            failed: true,
          }));
      } finally {
        clearTimeout(deadline);
        if (active && mode === "LIVE") timer = setTimeout(refresh, 8000);
      }
    };
    void refresh();
    return () => {
      active = false;
      controller?.abort();
      clearTimeout(timer);
    };
  }, [mode, at]);
  return result?.mode === mode ? result : undefined;
}
