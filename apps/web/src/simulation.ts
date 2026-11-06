import type { Vehicle } from "./fleet";

export const SIMULATION_DURATION = 90;
export const SIMULATION_GATE = { x: 22, z: -12 } as const;
const EXTERIOR_Z = -46;
const TURN_RADIUS = 6.2;
const MANEUVER_LANE_Z = 20;
const DEPARTURE_RAMP = 0.15;

export type SimulationPhase = "parked" | "departing" | "away" | "arriving";
export type SimulationPose = {
  x: number;
  z: number;
  /** Radians around +Y; the authored GLB faces local +Z. */
  heading: number;
  phase: SimulationPhase;
  visible: boolean;
};
export type SimulationEvent = {
  id: string;
  vehicleId: string;
  at: number;
  kind: "departure" | "arrival";
  label: string;
};

type Point = { x: number; z: number };
type Segment = {
  length: number;
  pointAt: (distance: number) => Omit<SimulationPose, "phase" | "visible">;
};

function line(from: Point, to: Point): Segment {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  const heading = Math.atan2(dx, dz);
  return {
    length,
    pointAt(distance) {
      const t = distance / length;
      return { x: from.x + dx * t, z: from.z + dz * t, heading };
    },
  };
}

function turn(center: Point, startAngle: number): Segment {
  return {
    length: (Math.PI * TURN_RADIUS) / 2,
    pointAt(distance) {
      const angle = startAngle - distance / TURN_RADIUS;
      return {
        x: center.x + Math.cos(angle) * TURN_RADIUS,
        z: center.z + Math.sin(angle) * TURN_RADIUS,
        heading: Math.atan2(Math.sin(angle), -Math.cos(angle)),
      };
    },
  };
}

function route(x: number, z: number) {
  const gateX = SIMULATION_GATE.x;
  const exitBendZ = MANEUVER_LANE_Z - TURN_RADIUS;
  const segments = [
    line({ x, z }, { x, z: exitBendZ }),
    turn({ x: x + TURN_RADIUS, z: exitBendZ }, Math.PI),
    line(
      { x: x + TURN_RADIUS, z: MANEUVER_LANE_Z },
      { x: gateX - TURN_RADIUS, z: MANEUVER_LANE_Z },
    ),
    turn({ x: gateX - TURN_RADIUS, z: exitBendZ }, Math.PI / 2),
    line({ x: gateX, z: exitBendZ }, { x: gateX, z: EXTERIOR_Z }),
  ];
  const length = segments.reduce((sum, segment) => sum + segment.length, 0);
  return {
    length,
    gateDistance: length - (SIMULATION_GATE.z - EXTERIOR_Z),
    pointAt(distance: number) {
      for (const segment of segments) {
        if (distance <= segment.length) return segment.pointAt(distance);
        distance -= segment.length;
      }
      const last = segments[segments.length - 1];
      return last.pointAt(last.length);
    },
  };
}

function departureProgress(t: number) {
  return (
    (t <= DEPARTURE_RAMP
      ? (t * t) / (2 * DEPARTURE_RAMP)
      : t - DEPARTURE_RAMP / 2) /
    (1 - DEPARTURE_RAMP / 2)
  );
}

function elapsedForProgress(progress: number) {
  const p = progress * (1 - DEPARTURE_RAMP / 2);
  return p <= DEPARTURE_RAMP / 2
    ? Math.sqrt(2 * p * DEPARTURE_RAMP)
    : p + DEPARTURE_RAMP / 2;
}

const trips = [
  {
    id: "8 2361",
    path: route(3.3, 2),
    departure: [2.5, 25.5],
    arrival: [37, 60],
  },
  { id: "8 1776", path: route(-2.3, 2), departure: [65, 89] },
] as const;

const tripById = new Map<string, (typeof trips)[number]>(
  trips.map((trip) => [trip.id, trip]),
);

function simulationSeconds(seconds: number) {
  return Number.isFinite(seconds)
    ? Math.min(SIMULATION_DURATION, Math.max(0, seconds))
    : 0;
}

export function sampleSimulation(
  vehicle: Pick<Vehicle, "id" | "x" | "z">,
  seconds: number,
): SimulationPose {
  const parked = {
    x: vehicle.x,
    z: vehicle.z,
    heading: 0,
    phase: "parked",
    visible: true,
  } as const;
  const trip = tripById.get(vehicle.id);
  const t = simulationSeconds(seconds);
  if (!trip || t <= trip.departure[0]) return parked;
  const { path } = trip;
  if (t < trip.departure[1]) {
    const progress =
      (t - trip.departure[0]) / (trip.departure[1] - trip.departure[0]);
    return {
      ...path.pointAt(departureProgress(progress) * path.length),
      phase: "departing",
      visible: true,
    };
  }
  if ("arrival" in trip && t >= trip.arrival[0]) {
    if (t >= trip.arrival[1]) return { ...parked, heading: Math.PI };
    const remaining = (trip.arrival[1] - t) / (trip.arrival[1] - trip.arrival[0]);
    const pose = path.pointAt(departureProgress(remaining) * path.length);
    return {
      ...pose,
      heading: (pose.heading + Math.PI) % (2 * Math.PI),
      phase: "arriving",
      visible: true,
    };
  }
  return {
    ...path.pointAt(path.length),
    phase: "away",
    visible: false,
  };
}

const events = trips
  .flatMap<SimulationEvent>((trip) => {
    const gateFraction = elapsedForProgress(
      trip.path.gateDistance / trip.path.length,
    );
    const result: SimulationEvent[] = [
      {
        id: `${trip.id}-departure`,
        vehicleId: trip.id,
        at:
          trip.departure[0] +
          gateFraction * (trip.departure[1] - trip.departure[0]),
        kind: "departure",
        label: `Ônibus ${trip.id} passou pela saída`,
      },
    ];
    if ("arrival" in trip) {
      result.push({
        id: `${trip.id}-arrival`,
        vehicleId: trip.id,
        at: trip.arrival[1] - gateFraction * (trip.arrival[1] - trip.arrival[0]),
        kind: "arrival",
        label: `Ônibus ${trip.id} passou pela entrada`,
      });
    }
    return result;
  })
  .sort((a, b) => a.at - b.at);

export function simulationEventsAt(seconds: number): SimulationEvent[] {
  const t = simulationSeconds(seconds);
  return events.filter((event) => event.at <= t).map((event) => ({ ...event }));
}
