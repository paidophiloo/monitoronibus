import { expect, test } from "@playwright/test";
import { fleet } from "../src/fleet";
import {
  SIMULATION_DURATION,
  SIMULATION_GATE,
  sampleSimulation,
  simulationEventsAt,
} from "../src/simulation";

const first = fleet.find((vehicle) => vehicle.id === "8 2361")!;
const unaffected = fleet.find((vehicle) => vehicle.id === "7 9154")!;

test("the lead bus pulls out, disappears only off site, and returns to its own bay", () => {
  const start = sampleSimulation(first, 0);
  expect(start).toMatchObject({
    x: first.x,
    z: first.z,
    phase: "parked",
    visible: true,
  });
  expect(sampleSimulation(first, 7)).toMatchObject({ phase: "departing", visible: true });
  const exterior = sampleSimulation(first, 30);
  expect(exterior).toMatchObject({ phase: "away", visible: false });
  const returning = sampleSimulation(first, 42);
  expect(returning).toMatchObject({ phase: "arriving", visible: true });
  expect(returning.z).toBeGreaterThan(exterior.z);
  expect(sampleSimulation(first, 65)).toMatchObject({
    x: first.x,
    z: first.z,
    phase: "parked",
    visible: true,
  });
  expect(sampleSimulation(unaffected, SIMULATION_DURATION)).toEqual(
    sampleSimulation(unaffected, 0),
  );
});

test("a sampled route has no jumps at the exit bends or during off-site handoff", () => {
  let previous = sampleSimulation(first, 0);
  for (let i = 1; i <= SIMULATION_DURATION * 10; i++) {
    const pose = sampleSimulation(first, i / 10);
    expect(Number.isFinite(pose.heading)).toBe(true);
    // A tenth of a simulated second may move the bus within a lane, not across it.
    expect(Math.hypot(pose.x - previous.x, pose.z - previous.z)).toBeLessThan(1);
    previous = pose;
  }
});

test("the movement log records only gate crossings the timeline has reached", () => {
  expect(simulationEventsAt(0)).toEqual([]);
  const all = simulationEventsAt(SIMULATION_DURATION);
  expect(all.map(({ vehicleId, kind }) => [vehicleId, kind])).toEqual([
    [first.id, "departure"],
    [first.id, "arrival"],
    ["8 1776", "departure"],
  ]);
  for (const [index, event] of all.entries()) {
    expect(simulationEventsAt(event.at - 0.01)).toEqual(all.slice(0, index));
    expect(simulationEventsAt(event.at)).toEqual(all.slice(0, index + 1));
    const vehicle = fleet.find(({ id }) => id === event.vehicleId)!;
    const crossing = sampleSimulation(vehicle, event.at);
    expect(crossing.x).toBeCloseTo(SIMULATION_GATE.x);
    expect(crossing.z).toBeCloseTo(SIMULATION_GATE.z);
    expect(crossing.phase).toBe(event.kind === "departure" ? "departing" : "arriving");
  }
});
