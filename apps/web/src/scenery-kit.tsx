import { useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  Object3D,
  type InstancedMesh,
} from "three";

export type XYZ = [number, number, number];
export type Part = {
  at: XYZ;
  size: XYZ;
  color: string;
  rotation?: XYZ;
};
export type Shape = "box" | "leaf" | "trunk";

export function part(
  at: XYZ,
  size: XYZ,
  color: string,
  rotation?: XYZ,
): Part {
  return { at, size, color, rotation };
}

export function Batch({
  parts,
  shape = "box",
  cast = false,
  receive = true,
  roughness = 0.88,
  emissive = "#000000",
  emissiveIntensity = 0,
}: {
  parts: Part[];
  shape?: Shape;
  cast?: boolean;
  receive?: boolean;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  const placement = useMemo(() => new Object3D(), []);
  const tint = useMemo(() => new Color(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    parts.forEach(({ at, size, rotation, color }, index) => {
      placement.position.set(...at);
      placement.rotation.set(...(rotation ?? [0, 0, 0]));
      placement.scale.set(...size);
      placement.updateMatrix();
      mesh.setMatrixAt(index, placement.matrix);
      mesh.setColorAt(index, tint.set(color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts, placement, tint]);

  if (!parts.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, parts.length]} castShadow={cast} receiveShadow={receive}>
      {shape === "leaf" ? <icosahedronGeometry args={[0.5, 1]} /> : shape === "trunk" ? <cylinderGeometry args={[0.35, 0.5, 1, 8]} /> : <boxGeometry />}
      <meshStandardMaterial roughness={roughness} emissive={emissive} emissiveIntensity={emissiveIntensity} />
    </instancedMesh>
  );
}

export function seeded(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
