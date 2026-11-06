import { useMemo } from "react";
import { Batch, part, seeded, type Part } from "./scenery-kit";

// A fictional city block composition, shown exclusively with the synthetic depot.
const WARM = ["#aba79e", "#c0b9a5", "#a49b8e", "#c7c0aa", "#9b9994", "#a3aaa6", "#afb6b3"];
const FAR = ["#a4b2b9", "#b4b7b4", "#a2a9b1", "#b9c4c5", "#a7b0b7"];
const GLASS = ["#657e86", "#6e8388", "#819295", "#64777d", "#a2afaa", "#586e77"];

function makeCity() {
  const rng = seeded(50731);
  const ground: Part[] = [];
  const architecture: Part[] = [];
  const trim: Part[] = [];
  const glazing: Part[] = [];

  const addRoad = (
    x: number, z: number, length: number, across: boolean, crossings: number[],
  ) => {
    const center = across ? x : z;
    const bottom = center - length / 2;
    const top = center + length / 2;
    ground.push(part(
      [x, across ? -0.111 : -0.115, z],
      across ? [length, 0.21, 6.2] : [6.2, 0.21, length], "#6d7474",
    ));
    // Split sidewalks at the intersections so they do not cross the lanes.
    let sidewalkStart = bottom;
    for (const sidewalkStop of [...crossings.map((v) => v - 3.54), top]) {
      const stop = Math.min(sidewalkStop, top);
      if (stop > sidewalkStart) {
        const span = stop - sidewalkStart;
        const mid = (sidewalkStart + stop) / 2;
        for (const direction of [-1, 1]) {
          ground.push(part(
            across ? [mid, 0.013, z + direction * 4.05] : [x + direction * 4.05, 0.013, mid],
            across ? [span, 0.15, 1.9] : [1.9, 0.15, span], "#a8aca0",
          ));
        }
      }
      sidewalkStart = Math.max(sidewalkStart, sidewalkStop + 7.08);
    }
    for (let t = bottom + 2.2; t < top - 1; t += 4.5) {
      if (crossings.some((v) => Math.abs(t - v) < 4.4)) continue;
      ground.push(part(
        across ? [t, 0.006, z] : [x, 0.006, t],
        across ? [1.6, 0.018, 0.075] : [0.075, 0.018, 1.6], "#b4ad8b",
      ));
    }
  };

  addRoad(-4, -28.4, 112, true, [-31.3, 22, 30.6]);
  addRoad(-5, 28.8, 113, true, [-31.3, 30.6]);
  addRoad(30.6, 0, 58, false, [-28.4, 28.8]);
  addRoad(-31.3, 0, 57, false, [-28.4, 28.8]);

  // The depot exit has an uninterrupted straight connection to the public road.
  ground.push(part([22, -0.109, -34.5], [7.15, 0.21, 26], "#757b79"));
  for (const x of [17.7, 26.4]) {
    ground.push(part([x, 0.018, -33.6], [1.05, 0.14, 3.0], "#aeb1a3"));
  }
  for (const z of [-23.2, -34, -38, -42, -46]) {
    ground.push(part([22, 0.007, z], [0.09, 0.016, 0.95], "#c5bc93"));
  }

  const building = (x: number, z: number, w: number, d: number, levels: number, variant: number, distant = false) => {
    const story = 2.22 + rng() * 0.3;
    const base = 0.25;
    const height = levels * story;
    const palette = distant ? FAR : WARM;
    const wall = palette[variant % palette.length];
    architecture.push(part([x, -0.055, z], [w + 2.2, 0.18, d + 2.2], distant ? "#a8ad9e" : "#a9ab98"));
    architecture.push(part([x, base + height / 2, z], [w, height, d], wall));
    architecture.push(part([x, base + height + 0.12, z], [w + 0.2, 0.24, d + 0.22], "#bac0b5"));
    architecture.push(part([x - w * 0.17, base + height + 0.65, z - d * 0.18], [w * 0.3, 0.96, d * 0.37], wall));
    if (variant % 3 === 0) {
      trim.push(part([x + w * 0.23, base + height + 0.39, z - d * 0.23], [w * 0.24, 0.42, d * 0.25], "#778b8e"));
      trim.push(part([x + w * 0.23, base + height + 0.67, z - d * 0.23], [w * 0.27, 0.13, d * 0.28], "#8fa2a1"));
    }
    const columns = Math.max(2, Math.floor(w / 1.8));
    const sideColumns = Math.max(2, Math.floor(d / 1.9));
    for (let y = 0; y < levels; y++) {
      const center = base + y * story + story * 0.56;
      for (let i = 0; i < columns; i++) {
        const px = x - w / 2 + ((i + 0.5) * w) / columns;
        const glass = GLASS[Math.floor(rng() * GLASS.length)];
        glazing.push(part([px, center, z + d / 2 + 0.012], [w / columns * 0.58, story * 0.52, 0.031], glass));
        if (!distant && variant % 4 === 1 && i > 0 && i < columns - 1) {
          trim.push(part([px, center - story * 0.29, z + d / 2 + 0.22], [w / columns * 0.86, 0.11, 0.46], "#b9b8a8"));
        }
      }
      for (let i = 0; i < sideColumns; i++) {
        const pz = z - d / 2 + ((i + 0.5) * d) / sideColumns;
        const glass = GLASS[Math.floor(rng() * GLASS.length)];
        glazing.push(part([x + w / 2 + 0.012, center, pz], [0.031, story * 0.52, d / sideColumns * 0.54], glass));
      }
      if (variant % 3 === 2 && y > 0) {
        trim.push(part([x, center - story * 0.36, z + d / 2 + 0.08], [w + 0.18, 0.15, 0.16], "#b6b4a9"));
      }
    }
  };

  // Low-rise workshops establish the near fabric; stepped residential towers
  // create a separate skyline rather than lining up behind the depot.
  [
    [-43, -18, 9, 8, 2, 3], [-42, -5, 7, 7, 3, 5], [-41, 11, 8, 9, 2, 2],
    [41, -17, 9, 8, 4, 5], [42, -4, 9, 8, 3, 1], [42, 11, 8, 8, 3, 2],
    [42, 23, 8, 7, 2, 4], [52, 5, 8, 9, 5, 3], [52, -9, 9, 8, 6, 4],
    [-46, -36, 8, 7, 4, 5], [-33, -37, 8, 9, 6, 2], [-21, -39, 7, 9, 5, 1],
    [-10, -37, 9, 7, 4, 4], [1, -38, 8, 9, 6, 6], [13, -37, 8, 8, 4, 3],
    [31, -39, 7, 7, 5, 2], [42, -36, 8, 8, 5, 1], [53, -40, 10, 8, 4, 6],
  ].forEach(([x, z, w, d, floors, variant]) => building(x, z, w, d, floors, variant));

  for (let i = 0; i < 19; i++) {
    const x = -78 + i * 8.65 + rng() * 1.7;
    const z = -55 - Math.floor(rng() * 3) * 10;
    const levels = 6 + Math.floor(rng() * 8);
    building(x, z, 4.8 + rng() * 3.5, 5.5 + rng() * 3, levels, i, true);
  }

  return { ground, architecture, trim, glazing };
}

export function City() {
  const { ground, architecture, trim, glazing } = useMemo(makeCity, []);
  return (
    <>
      <Batch parts={ground} />
      <Batch parts={architecture} />
      <Batch parts={trim} />
      <Batch parts={glazing} roughness={0.49} />
    </>
  );
}
