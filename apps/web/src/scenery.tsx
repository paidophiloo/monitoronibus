import { useEffect, useMemo } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { fleet } from "./fleet";
import { City } from "./scenery-city";
import { Batch, part, seeded, type Part, type XYZ } from "./scenery-kit";

function Sign({
  text,
  at,
  width,
  height,
  color = "#eeeade",
  ground = false,
  weight = 700,
}: {
  text: string;
  at: XYZ;
  width: number;
  height: number;
  color?: string;
  ground?: boolean;
  weight?: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.font = `${weight} 100px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 68, 489);
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    result.anisotropy = 4;
    return result;
  }, [text, color, weight]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={at} rotation={ground ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function Asphalt() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const grain = ctx.createImageData(256, 256);
    const rng = seeded(8734);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        const aggregate = (rng() - 0.5) * 22;
        const patch = Math.cos(x * Math.PI / 32) * Math.sin(y * Math.PI / 32) * 2;
        const value = 155 + aggregate + patch;
        grain.data.set([value + 1, value, value - 2, 255], i);
      }
    }
    ctx.putImageData(grain, 0, 0);
    const map = new CanvasTexture(canvas);
    map.wrapS = map.wrapT = RepeatWrapping;
    map.repeat.set(8, 7.25);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[0, -0.007, 1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[53, 48]} />
      <meshStandardMaterial color="#a5a6a5" map={texture} roughness={0.97} />
    </mesh>
  );
}

const C = {
  concrete: "#cbc9bc",
  trim: "#9a9f96",
  metal: "#6c7a78",
  office: "#dbd9cb",
  roof: "#d8d9cd",
  glass: "#445e63",
  lane: "#eeeade",
  yellow: "#c9932e",
  green: "#305b50",
};

function makeYard() {
  const terrain: Part[] = [];
  const fixtures: Part[] = [];
  const details: Part[] = [];
  const painted: Part[] = [];
  const glazing: Part[] = [];
  const lights: Part[] = [];
  const posts: Part[] = [];
  const foliage: Part[] = [];
  const branches: Part[] = [];
  const rng = seeded(611401);
  const g = (at: XYZ, size: XYZ, color: string) => terrain.push(part(at, size, color));
  const f = (at: XYZ, size: XYZ, color: string, rotation?: XYZ) => fixtures.push(part(at, size, color, rotation));
  const d = (at: XYZ, size: XYZ, color: string, rotation?: XYZ) => details.push(part(at, size, color, rotation));
  const p = (at: XYZ, size: XYZ, color = C.lane, rotation?: XYZ) => painted.push(part(at, size, color, rotation));

  g([0, -0.77, 0], [220, 1, 220], "#879479");
  g([0, -0.17, 1], [53, 0.3, 48], "#777d76");
  g([-3.3, 0.045, -8.35], [42.8, 0.12, 1.24], C.concrete);
  g([-24, 0.047, 4], [1.35, 0.14, 38], C.concrete);
  g([26.36, 0.047, 4], [1.25, 0.14, 38], C.concrete);
  g([-0.4, 0.048, 24.19], [52.2, 0.14, 1.3], C.concrete);
  g([-0.4, 0.078, 24.58], [52.2, 0.19, 0.18], "#abaea0");
  g([-24.66, 0.05, 4], [0.18, 0.16, 38], "#acae9f");

  const fence = (start: number, stop: number, z: number) => {
    const count = Math.ceil((stop - start) / 2.25);
    const step = (stop - start) / count;
    g([(start + stop) / 2, 0.24, z], [stop - start, 0.48, 0.28], "#a9ada0");
    for (const y of [0.63, 1.89]) d([(start + stop) / 2, y, z], [stop - start, 0.05, 0.085], "#4e6159");
    for (let i = 0; i <= count; i++) {
      const x = start + i * step;
      f([x, 1.18, z], [0.10, 1.88, 0.10], "#4b5a54");
      if (i === count) break;
      for (let j = 1; j < 9; j++) d([x + j * step / 9, 1.18, z], [0.034, 1.43, 0.035], "#63706a");
    }
  };
  fence(-24.4, 18.25, -21.4);
  fence(25.6, 28, -21.4);

  // Architecture behind the bays: workshop cut-outs with recessed interiors,
  // glazed dispatch office, concrete ribs and detailed photovoltaic tables.
  const gx = -7.8, gz = -14;
  const shop = (x: number, y: number, z: number, w: number, h: number, depth: number, color: string) => f([gx + x, y, gz + z], [w, h, depth], color);
  const shopDetail = (x: number, y: number, z: number, w: number, h: number, depth: number, color: string) => d([gx + x, y, gz + z], [w, h, depth], color);
  shop(0, 3.17, -4.31, 30, 6.34, 0.33, "#b4bab1");
  shop(-14.87, 3.17, 0, 0.26, 6.34, 8.62, "#b8beb3");
  shop(14.87, 3.17, 0, 0.26, 6.34, 8.62, "#b3baaf");
  shop(0, 5.16, 4.27, 30, 2.36, 0.4, C.office);
  shop(0, 6.43, 0, 30.5, 0.3, 9.2, C.roof);
  shop(0, 6.73, 4.49, 30.5, 0.34, 0.19, "#b7bdb1");
  shop(0, 6.73, -4.49, 30.5, 0.34, 0.19, "#adb7ac");
  shop(-15.14, 6.73, 0, 0.2, 0.34, 9, "#b7bdb1");
  shop(15.14, 6.73, 0, 0.2, 0.34, 9, "#b7bdb1");
  shop(-10.25, 1.98, 2.23, 9.23, 3.96, 4.42, C.office);
  shop(-10.25, 0.37, 4.51, 9.24, 0.74, 0.15, "#b8c0b5");
  shop(-10.36, 4.72, 4.54, 8.5, 1.26, 0.16, "#dde0d2");

  for (let i = 0; i < 8; i++) {
    const x = -14.29 + i * 1.11;
    glazing.push(part([gx + x, 1.65, gz + 4.49], [1.065, 1.53, 0.09], ["#40565c", "#566a6d", "#485e62"][i % 3]));
    shopDetail(x, 1.46, 4.546, 1.07, 0.036, 0.017, "#8f9e98");
  }
  for (let x = -5.65; x < 15; x += 0.24) shopDetail(x, 5.19, 4.49, 0.036, 2.18, 0.041, "#bfc4b7");
  for (let z = -4.15; z < 4.26; z += 0.28) shopDetail(15.02, 3.34, z, 0.04, 5.76, 0.03, "#a8b0a7");

  for (const x of [-5.55, -0.31, 4.86, 10.0, 14.8]) {
    shop(x, 1.99, 4.29, 0.27, 3.98, 0.48, "#a3aaa0");
    shop(x, 0.44, 4.58, 0.29, 0.87, 0.1, C.yellow);
    for (const y of [0.2, 0.44, 0.68]) d([gx + x, y, gz + 4.644], [0.315, 0.074, 0.022], "#463e34", [0, 0, 0.34]);
  }
  for (const [i, x] of [-2.92, 2.29, 7.45, 12.4].entries()) {
    const width = i === 3 ? 4.54 : 4.83;
    const shut = i === 2;
    shop(x, 3.56, 4.34, width, shut ? 0.80 : 0.96, 0.27, "#626c67");
    if (shut) {
      shop(x, 1.59, 4.18, width, 3.18, 0.15, "#586866");
      for (let y = 0.23; y < 3.2; y += 0.16) shopDetail(x, y, 4.274, width, 0.027, 0.023, "#70817c");
    } else {
      shop(x, 1.58, -0.7, width, 3.16, 0.15, "#424845");
      shop(x - width * 0.48, 1.59, 1.8, 0.14, 3.18, 5.12, "#69706a");
      shop(x + width * 0.48, 1.59, 1.8, 0.14, 3.18, 5.12, "#69706a");
      shop(x, 0.012, 1.75, width, 0.043, 5.4, "#777970");
      shop(x - width * 0.24, 0.35, 1.85, 0.70, 0.69, 0.57, i % 2 ? "#58767b" : "#a2674f");
      shopDetail(x - width * 0.24, 0.51, 2.149, 0.58, 0.025, 0.018, "#c6ba9c");
      shopDetail(x - width * 0.24, 0.38, 2.149, 0.58, 0.025, 0.018, "#c6ba9c");
    }
    lights.push(part([gx + x, 3.22, gz + 4.49], [width * 0.57, 0.061, 0.085], "#e9bb72"));
  }
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 7; col++) {
      const x = -12.9 + col * 3.25, z = -2.5 + row * 2.0;
      shop(x, 6.64, z, 2.99, 0.105, 1.51, "#52636a");
      glazing.push(part([gx + x, 6.704, gz + z], [2.87, 0.028, 1.39], col % 2 ? "#344e65" : "#37546a"));
      for (let j = -2; j <= 2; j++) shopDetail(x + 0.47 * j, 6.724, z, 0.013, 0.013, 1.39, "#718899");
      shopDetail(x, 6.724, z, 2.85, 0.013, 0.014, "#718899");
    }
  }
  for (const x of [10, 12.6]) {
    shop(x, 6.98, -0.45, 1.42, 0.69, 1.65, "#aeb8ad");
    shop(x, 7.34, -0.45, 1.48, 0.11, 1.72, "#d4d8cf");
    for (let y = 6.87; y < 7.22; y += 0.093) shopDetail(x, y, 0.39, 1.23, 0.028, 0.038, "#7b8c85");
  }

  // Portaria clearance: x=18.6..25.4 remains free at vehicle height.
  f([16.45, 0.1, -12.25], [3.5, 0.2, 4.8], "#c8c6b6");
  f([16.28, 1.51, -12.05], [2.65, 2.82, 3.0], "#c9cdc0");
  f([16.28, 3.0, -12.05], [2.82, 0.19, 3.17], "#d9dace");
  f([16.27, 0.41, -10.51], [2.57, 0.7, 0.08], "#a8afa4");
  for (const x of [15.44, 16.25, 17.05]) glazing.push(part([x, 1.96, -10.506], [0.77, 0.96, 0.096], C.glass));
  glazing.push(part([17.63, 1.96, -12.02], [0.073, 0.96, 2.5], "#617579"));
  f([21.11, 4.94, -12.1], [11.6, 0.37, 5.25], C.roof);
  f([21.11, 4.81, -9.45], [11.6, 0.38, 0.17], "#e1e2d6");
  f([21.11, 5.15, -12.1], [11.68, 0.11, 5.34], "#c4cabe");
  f([21.11, 4.70, -12.02], [10.9, 0.11, 0.24], "#7b8a83");
  for (const x of [16.1, 26.1]) {
    for (const z of [-13.83, -10.18]) {
      f([x, 2.44, z], [0.21, 4.8, 0.21], "#62716b");
      f([x, 0.22, z], [0.35, 0.45, 0.35], "#7b867d");
    }
  }
  for (const x of [18.07, 25.86]) {
    f([x, 0.58, -9.68], [0.37, 1.15, 0.34], C.yellow);
    f([x, 1.22, -9.68], [0.20, 0.14, 0.19], "#343e37");
    lights.push(part([x, 1.22, -9.58], [0.091, 0.056, 0.021], "#87b99b"));
  }
  f([18.07, 2.56, -9.68], [0.091, 2.75, 0.085], "#f0e8d5");
  for (let i = 0; i < 6; i++) d([18.07, 1.43 + i * 0.46, -9.632], [0.094, 0.17, 0.016], "#bd5847");
  f([22, 4.82, -9.338], [3.15, 0.38, 0.06], C.green);

  const addLight = (x: number, z: number, height: number, dx: number) => {
    posts.push(part([x, height / 2, z], [0.158, height, 0.158], "#596864"));
    f([x, 0.09, z], [0.24, 0.18, 0.24], "#91978d");
    f([x + dx * 0.25, height, z], [0.53, 0.067, 0.071], "#75837a");
    f([x + dx * 0.48, height - 0.016, z], [0.38, 0.125, 0.23], "#91a098");
    lights.push(part([x + dx * 0.48, height - 0.087, z], [0.29, 0.018, 0.16], "#f3efda"));
  };
  for (const x of [-20, -5, 10]) addLight(x, -8.24, 4.83, 1);
  addLight(26.41, 5, 5.3, -1);
  for (const x of [-20, 1, 16]) addLight(x, 24.05, 4.45, 1);

  for (const { x, z } of fleet) {
    for (const offset of [-2.26, 2.26]) p([x + offset, 0.008, z], [0.105, 0.016, 13]);
    p([x, 0.008, z + 6.5], [4.59, 0.016, 0.106]);
  }
  for (let i = 0; i < 8; i++) p([19.1 + i * 0.58, 0.009, 9.55], [0.36, 0.016, 2.78]);
  for (let i = 0; i < 6; i++) p([18.77, 0.009, -8 + i * 2.7], [0.088, 0.016, 1.31]);
  for (let i = 0; i < 7; i++) p([25.38, 0.009, -18.5 + i * 3.28], [0.085, 0.016, 1.47]);
  p([22, 0.009, -6.9], [0.18, 0.016, 0.83]);
  p([21.8, 0.009, -7.25], [0.49, 0.016, 0.14], C.lane, [0, 0.76, 0]);
  p([22.2, 0.009, -7.25], [0.49, 0.016, 0.14], C.lane, [0, -0.76, 0]);
  for (const [x, z, angle] of [[8, 20.8, -Math.PI / 2], [19.77, 17.3, 0.42], [21.8, 1.15, 0]]) {
    const center = (lateral: number, ahead: number): XYZ => [x + lateral * Math.cos(angle) - ahead * Math.sin(angle), 0.009, z + lateral * Math.sin(angle) - ahead * Math.cos(angle)];
    p(center(0, 0), [0.13, 0.016, 0.86], C.lane, [0, angle, 0]);
    p(center(-0.18, 0.37), [0.48, 0.016, 0.12], C.lane, [0, angle + 0.73, 0]);
    p(center(0.18, 0.37), [0.48, 0.016, 0.12], C.lane, [0, angle - 0.73, 0]);
  }
  for (const z of [-19.5, -18, 14.4, 22.8]) p([-23.15, 0.011, z], [0.18, 0.014, 1.05], "#a0a292");
  for (const [x, z] of [[-18.8, 11.2], [-10.7, -7.62], [11.8, 20.5], [21.72, -16.9]]) {
    p([x, 0.01, z], [0.66, 0.017, 0.40], "#565d59");
    for (let i = -2; i <= 2; i++) p([x + i * 0.10, 0.023, z], [0.028, 0.007, 0.36], "#8a8d82");
  }
  for (let x = -24.8; x < 25.5; x += 1.42) {
    d([x, 0.122, 24.18], [0.018, 0.007, 1.28], "#9ca096");
  }
  for (let z = -13.1; z <= 22.3; z += 1.42) {
    d([-24, 0.12, z], [1.3, 0.007, 0.019], "#a1a398");
    d([26.36, 0.12, z], [1.2, 0.007, 0.019], "#a1a398");
  }

  const greens = ["#4a6c43", "#658048", "#7d914d", "#526f3b", "#617f57", "#8c9954"];
  const purple = ["#785e91", "#9274a0", "#84669d", "#a087a9", "#6f577f"];
  function tree(x: number, z: number, s: number, floral = false) {
    const palette = floral ? purple : greens;
    const trunk = "#695845";
    const h = 3.02 * s;
    const top = (2.1 + rng() * 0.45) * s;
    const phase = rng() * Math.PI * 2;
    posts.push(part([x, h * 0.49, z], [0.27 * s, h, 0.28 * s], trunk, [0.015, 0, 0.035]));
    for (let j = 0; j < 7; j++) {
      const angle = phase + j * Math.PI * 2 / 7;
      const r = s * (0.68 + rng() * 0.7);
      const crownX = x + Math.cos(angle) * r, crownZ = z + Math.sin(angle) * r;
      const crownY = top + s * (0.66 + rng() * 0.57);
      const spread = s * (1.12 + rng() * 1.03);
      branches.push(part([(x + crownX) / 2, crownY - s * 0.67, (z + crownZ) / 2], [0.10 * s, 1.75 * s, 0.11 * s], trunk, [Math.sin(angle) * 0.57, 0, -Math.cos(angle) * 0.57]));
      foliage.push(part([crownX, crownY, crownZ], [spread * 1.15, spread * 0.81, spread], palette[j % palette.length], [0, angle, 0.08]));
      foliage.push(part([crownX + 0.2 * s, crownY + s * 0.48, crownZ], [spread * 0.71, spread * 0.67, spread * 0.75], palette[(j + 1) % palette.length], [0, angle + 0.5, -0.14]));
    }
    foliage.push(part([x, top + 1.68 * s, z], [2.0 * s, 1.48 * s, 1.85 * s], palette[2]));
  }

  [
    [-24.8, -17.6, 1.1], [-24.9, -7.4, 1.12], [-25.1, 3.1, 0.95], [-25, 14.2, 1.09],
    [-20, -23.4, 1.13], [-12.7, -23.5, 1.24], [-5.5, -23.6, 1.02], [2, -23.6, 1.41],
    [8.1, -23.25, 1.24], [14.15, -23.48, 1.0], [27.8, -21.25, 1.16],
    [27.2, -4.5, 0.99], [27.1, 7.8, 0.95], [27.2, 18.3, 0.85],
    [-20, 25.1, 0.76], [-3, 25.1, 0.74], [13.5, 25.1, 0.78], [23.6, 25.2, 0.85],
    [37, -22, 1.3], [37.5, -9, 1.0], [37, 6.2, 1.24], [37, 18, 1.07],
  ].forEach(([x, z, s], i) => tree(x, z, s, i === 5 || i === 8 || i === 18));

  function bed(x: number, z: number, width: number, depth: number, across: boolean) {
    g([x, 0.06, z], [width, 0.28, depth], "#b9b8a8");
    g([x, 0.208, z], [width - 0.23, 0.055, depth - 0.24], "#68734d");
    const count = Math.floor((across ? width : depth) / 0.75);
    for (let i = 0; i < count; i++) {
      const step = (i + 0.5) * (across ? width : depth) / count - (across ? width : depth) / 2;
      const offset = (rng() - 0.5) * 0.45;
      const size = 0.44 + rng() * 0.28;
      for (let j = 0; j < 3; j++) foliage.push(part([x + (across ? step : offset) + (j - 1) * 0.19, 0.32 + rng() * 0.2, z + (across ? offset : step)], [size, size * 0.74, size], greens[(i + j) % greens.length]));
    }
  }
  bed(-12.8, 25.2, 22.25, 1.22, true);
  bed(12.55, 25.2, 23.4, 1.22, true);
  bed(27.24, 9.62, 1.45, 8.8, false);
  bed(27.24, 19.72, 1.45, 7.8, false);
  bed(13.75, -19.98, 8.05, 1.37, true);
  bed(-12, -20.65, 23.1, 1.19, true);
  bed(3.55, -20.65, 7.0, 1.19, true);

  return { terrain, fixtures, details, painted, glazing, lights, posts, foliage, branches };
}

export function Scenery() {
  const parts = useMemo(makeYard, []);
  return (
    <>
      <City />
      <Batch parts={parts.terrain} />
      <Asphalt />
      <Batch parts={parts.fixtures} cast />
      <Batch parts={parts.details} />
      <Batch parts={parts.painted} />
      <Batch parts={parts.glazing} roughness={0.51} />
      <Batch parts={parts.lights} receive={false} emissive="#e9bf7f" emissiveIntensity={0.18} />
      <Batch parts={parts.posts} shape="trunk" cast />
      <Batch parts={parts.branches} shape="trunk" />
      <Batch parts={parts.foliage} shape="leaf" cast />

      <Sign text="PÁTIO LESTE" at={[-18.16, 4.95, -9.372]} width={7.6} height={1.02} color="#253d34" />
      <Sign text="CENTRO DE OPERAÇÕES" at={[-18.16, 4.45, -9.372]} width={7.52} height={0.45} color="#51635a" />
      <Sign text="PORTARIA  01" at={[22, 4.83, -9.303]} width={2.8} height={0.35} />
      <Sign text="SAÍDA" at={[22, 0.024, -5.6]} width={4.4} height={1.23} ground />
      {fleet.map(({ x, z, bay }) => (
        <Sign key={bay} text={bay ?? ""} at={[x, 0.023, z + 7.22]} width={2.2} height={0.83} ground />
      ))}
    </>
  );
}
