import { useEffect, useMemo } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { fleet } from "./fleet";

type XYZ = [number, number, number];

function Block({
  at,
  size,
  color,
  shadow = true,
}: {
  at: XYZ;
  size: XYZ;
  color: string;
  shadow?: boolean;
}) {
  return (
    <mesh position={at} castShadow={shadow} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.92} />
    </mesh>
  );
}

export function Sign({
  text,
  at,
  width,
  height,
  color = "#f0f0e7",
  ground = false,
}: {
  text: string;
  at: XYZ;
  width: number;
  height: number;
  color?: string;
  ground?: boolean;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.font = "bold 78px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 69, 490);
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    result.anisotropy = 4;
    return result;
  }, [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={at} rotation={ground ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function Tree({
  x,
  z,
  scale = 1,
  tint = 0,
}: {
  x: number;
  z: number;
  scale?: number;
  tint?: number;
}) {
  const palette =
    tint === 2
      ? ["#9173a3", "#a482b5", "#725781"]
      : tint === 1
        ? ["#91a04e", "#768841", "#677d45"]
        : ["#5b7a50", "#769150", "#48684a"];
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 1.65, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.22, 3.3, 6]} />
        <meshStandardMaterial color="#6b5840" />
      </mesh>
      {(
        [
          [-0.9, 3.1, 0.2, 1.16],
          [0.85, 3.35, 0.1, 1.26],
          [0.1, 3.2, 0.85, 1.08],
          [0, 4.05, -0.1, 1.32],
          [0.1, 3.26, -0.85, 1.16],
        ] as const
      ).map(([a, b, c, r], i) => (
        <mesh key={i} position={[a, b, c]} scale={[1, 0.79, 1]} castShadow>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color={palette[i % 3]} />
        </mesh>
      ))}
    </group>
  );
}

function LightPole({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 2.7, 0]} castShadow>
        <cylinderGeometry args={[0.064, 0.095, 5.4, 8]} />
        <meshStandardMaterial color="#758185" />
      </mesh>
      <Block at={[0.25, 5.4, 0]} size={[0.61, 0.14, 0.24]} color="#9da8ac" />
      <Block at={[0.31, 5.32, 0]} size={[0.43, 0.022, 0.18]} color="#ebeddb" />
    </group>
  );
}

function Garage() {
  return (
    <group position={[-7.8, 0, -14]}>
      <Block at={[0, 3.25, 0]} size={[30, 6.5, 8.9]} color="#d7d9d2" />
      <Block at={[0, 6.58, 0]} size={[30.5, 0.35, 9.35]} color="#e9eae1" />
      <Block at={[0, 6.82, -4.58]} size={[30.5, 0.26, 0.17]} color="#aeb5b3" />
      <Block at={[0, 6.77, 4.58]} size={[30.5, 0.19, 0.16]} color="#bbc3bf" />
      <Block at={[-10.1, 1.64, 4.48]} size={[8.5, 1.7, 0.12]} color="#495d64" />
      {Array.from({ length: 9 }, (_, i) => (
        <Block
          key={i}
          at={[-14.2 + i * 1.025, 1.64, 4.58]}
          size={[0.055, 1.73, 0.035]}
          color="#9caead"
        />
      ))}
      <Block
        at={[-10.2, 4.19, 4.47]}
        size={[8.0, 1.67, 0.08]}
        color="#e1e3da"
      />
      <Sign
        text="PÁTIO LESTE"
        at={[-10.2, 4.38, 4.525]}
        width={6.7}
        height={1.27}
        color="#1d3c33"
      />
      <Sign
        text="MOBILIDADE URBANA"
        at={[-10.2, 3.62, 4.525]}
        width={5.8}
        height={0.64}
        color="#50615a"
      />
      {[-3.2, 2.4, 8, 12.6].map((x, i) => (
        <group key={x}>
          <Block
            at={[x, 1.77, 4.49]}
            size={[i === 3 ? 3.3 : 4.55, 3.55, 0.16]}
            color={i === 1 ? "#444e4f" : "#586262"}
          />
          {Array.from({ length: 9 }, (_, j) => (
            <Block
              key={j}
              at={[x, 1.34 + j * 0.236, 4.59]}
              size={[i === 3 ? 3.24 : 4.47, 0.024, 0.025]}
              color="#6f7875"
              shadow={false}
            />
          ))}
          <Block
            at={[x, 3.34, 4.64]}
            size={[2.8, 0.065, 0.06]}
            color="#f5ce80"
          />
          <Block
            at={[x - 1.64, 0.45, 4.78]}
            size={[0.15, 0.9, 0.15]}
            color="#d0a02e"
          />
          <Block
            at={[x + 1.64, 0.45, 4.78]}
            size={[0.15, 0.9, 0.15]}
            color="#d0a02e"
          />
        </group>
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <group
          key={i}
          position={[
            -12 + (i % 6) * 3.45,
            6.82,
            -2.4 + Math.floor(i / 6) * 2.15,
          ]}
          rotation={[0.12, 0, 0]}
        >
          <Block at={[0, 0, 0]} size={[2.98, 0.08, 1.57]} color="#344d60" />
          {[0, 1, 2, 3, 4].map((j) => (
            <Block
              key={j}
              at={[-1.18 + j * 0.59, 0.047, 0]}
              size={[0.016, 0.013, 1.54]}
              color="#728593"
              shadow={false}
            />
          ))}
          <Block
            at={[0, 0.047, 0]}
            size={[2.96, 0.013, 0.017]}
            color="#728593"
            shadow={false}
          />
        </group>
      ))}
      <Block
        at={[11.5, 7.02, -1.25]}
        size={[2.32, 0.7, 2.15]}
        color="#bec5c3"
      />
      <Block
        at={[11.5, 7.4, -1.25]}
        size={[2.42, 0.11, 2.25]}
        color="#e2e6df"
      />
    </group>
  );
}

function Asphalt() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const grain = ctx.createImageData(128, 128);
    let seed = 8734;
    for (let i = 0; i < grain.data.length; i += 4) {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      const value = 157 + ((seed >>> 24) % 31);
      grain.data.set([value, value + 2, value + 3, 255], i);
    }
    ctx.putImageData(grain, 0, 0);
    const map = new CanvasTexture(canvas);
    map.wrapS = map.wrapT = RepeatWrapping;
    map.repeat.set(13, 12);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh
      position={[0, -0.007, 1]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[53, 48]} />
      <meshStandardMaterial color="#a1a39f" map={texture} roughness={0.96} />
    </mesh>
  );
}

export function Scenery() {
  return (
    <>
      <Block
        at={[0, -0.77, 0]}
        size={[220, 1, 220]}
        color="#929e83"
        shadow={false}
      />
      <Block
        at={[0, -0.17, 1]}
        size={[53, 0.3, 48]}
        color="#858b8a"
        shadow={false}
      />
      <Asphalt />
      <Block at={[0, 0.04, -8.31]} size={[47, 0.12, 1.15]} color="#d0cfc1" />
      <Block at={[-23.6, 0.05, 4]} size={[1.15, 0.14, 38]} color="#c9cbbc" />
      <Block at={[25.9, 0.035, 3.5]} size={[1.1, 0.13, 41]} color="#c9cbbc" />
      <Block
        at={[0.2, 0, 27.5]}
        size={[70, 0.13, 4]}
        color="#747c7d"
        shadow={false}
      />
      <Block at={[-1, 0.06, 24]} size={[53, 0.12, 1.25]} color="#c9cbbc" />
      <Garage />
      <group position={[17.8, 0, -12.5]}>
        <Block at={[0, 1.48, 0]} size={[3.8, 2.96, 3.3]} color="#dce0d7" />
        <Block at={[0, 2.18, 1.68]} size={[2.96, 0.84, 0.09]} color="#566c73" />
        <Block at={[1.94, 2.16, 0]} size={[0.09, 0.84, 2.42]} color="#687e84" />
        <Block at={[1.1, 3.46, 0]} size={[7.9, 0.26, 5.12]} color="#eeeee5" />
        <Block
          at={[4.47, 1.65, -2.12]}
          size={[0.15, 3.31, 0.15]}
          color="#667877"
        />
        <Block
          at={[4.47, 1.65, 2.12]}
          size={[0.15, 3.31, 0.15]}
          color="#667877"
        />
        <Block
          at={[2.33, 0.62, 2.77]}
          size={[0.36, 1.22, 0.34]}
          color="#dfad37"
        />
        <Block
          at={[4.04, 1.12, 2.77]}
          size={[3.4, 0.095, 0.11]}
          color="#f1ede0"
        />
        {[0, 1, 2, 3].map((i) => (
          <Block
            key={i}
            at={[2.8 + i * 0.76, 1.12, 2.835]}
            size={[0.25, 0.1, 0.018]}
            color="#c65b43"
          />
        ))}
      </group>
      <Sign
        text="SAÍDA  ↑"
        at={[21.4, 0.02, -3.8]}
        width={5.8}
        height={1.47}
        ground
      />
      {fleet.map(({ bay, x, z }) => (
        <group key={bay}>
          {[-2.26, 2.26].map((offset) => (
            <Block
              key={offset}
              at={[x + offset, 0.008, z]}
              size={[0.085, 0.018, 13]}
              color="#e5e8db"
              shadow={false}
            />
          ))}
          <Block
            at={[x, 0.008, z + 6.5]}
            size={[4.59, 0.018, 0.087]}
            color="#e5e8db"
            shadow={false}
          />
          <Sign
            text={bay ?? ""}
            at={[x, 0.025, z + 7.2]}
            width={3.25}
            height={0.83}
            ground
          />
        </group>
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <Block
          key={i}
          at={[19.1 + i * 0.58, 0.009, 9.55]}
          size={[0.36, 0.016, 2.78]}
          color="#e6e7dc"
          shadow={false}
        />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <Block
          key={i}
          at={[19.1, 0.009, -3 + i * 2.68]}
          size={[0.086, 0.016, 1.3]}
          color="#d9dfd4"
          shadow={false}
        />
      ))}
      {[-20, -5, 10, 23].map((x) => (
        <LightPole key={x} x={x} z={-7.95} />
      ))}
      {[-20, 1, 16].map((x) => (
        <LightPole key={x} x={x} z={23.3} />
      ))}
      {[-24, -19, -12, -4, 5, 11, 17, 23].map((x, i) => (
        <Tree
          key={x}
          x={x}
          z={-21.6}
          scale={1.04 + (i % 3) * 0.19}
          tint={i % 4 === 1 ? 2 : i % 2}
        />
      ))}
      {[-18, -8, 1, 10, 21].map((z, i) => (
        <Tree
          key={z}
          x={-24.65}
          z={z}
          scale={0.79 + (i % 3) * 0.11}
          tint={i % 2}
        />
      ))}
      {[-11, 1, 13, 20].map((z, i) => (
        <Tree
          key={z}
          x={26.35}
          z={z}
          scale={0.79 + (i % 3) * 0.1}
          tint={i % 2}
        />
      ))}
      {Array.from({ length: 16 }, (_, i) => (
        <Tree
          key={i}
          x={-24 + i * 3.13}
          z={23.95}
          scale={0.26 + (i % 3) * 0.044}
          tint={i % 2}
        />
      ))}
      {Array.from({ length: 17 }, (_, i) => {
        const h = 5 + ((i * 13) % 12);
        const x = -53 + i * 6.1,
          z = -39 - (i % 4) * 5.5;
        return (
          <group key={i}>
            <Block
              at={[x, h / 2, z]}
              size={[3.8 + (i % 3), h, 3.4]}
              color={["#a9b6b5", "#bcc6c6", "#aab5bc"][i % 3]}
              shadow={false}
            />
            {Array.from({ length: Math.floor(h / 2) }, (_, j) => (
              <Block
                key={j}
                at={[x, 1.7 + j * 1.84, z + 1.713]}
                size={[3.0 + (i % 3), 0.21, 0.025]}
                color="#82999f"
                shadow={false}
              />
            ))}
          </group>
        );
      })}
    </>
  );
}
