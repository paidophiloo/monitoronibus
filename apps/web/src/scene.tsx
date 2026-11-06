import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { BusFront } from "lucide-react";
import {
  Component,
  Suspense,
  type ComponentRef,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  Color,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Shape,
  Vector2,
  Vector3,
} from "three";
import type { Vehicle } from "./fleet";
import { localPoint, type Area } from "./observations";
import { Scenery } from "./scenery";

const MODEL = "/models/sp-standard-bus.glb";
const DEFAULT_TARGET = new Vector3(0, 0.6, 0);
const DEFAULT_VIEW = new Vector3(38, 38, 59);
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

export type CameraAction = {
  type: "in" | "out" | "home" | "focus" | "profile" | "top";
  vehicle?: Vehicle;
};

function CameraRig({
  action,
  extent,
}: {
  action: CameraAction;
  extent: number;
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, invalidate, size } = useThree();
  const base =
    (Math.min(size.width / (size.width < 620 ? 40 : 53), size.height / 35) *
      27) /
    extent;
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit || !(camera instanceof OrthographicCamera)) return;
    if (action.type === "home") {
      orbit.target.copy(DEFAULT_TARGET);
      camera.position
        .copy(DEFAULT_VIEW)
        .multiplyScalar(Math.max(1, extent / 27));
      camera.zoom = base;
    } else if (action.vehicle) {
      orbit.target.set(action.vehicle.x, 1.3, action.vehicle.z);
      const offset =
        action.type === "top"
          ? new Vector3(0.01, 44, 0.01)
          : action.type === "profile"
            ? new Vector3(42, 5, 0.01)
            : new Vector3(28, 21, 38);
      camera.position.copy(orbit.target).add(offset);
      camera.zoom = clamp(base * 2.12, 9, 68);
    } else {
      camera.zoom = clamp(
        camera.zoom * (action.type === "in" ? 1.22 : 1 / 1.22),
        0.08,
        68,
      );
    }
    camera.updateProjectionMatrix();
    orbit.update();
    invalidate();
  }, [action, base, camera, extent, invalidate]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      minZoom={0.08}
      maxZoom={68}
      minPolarAngle={0.06}
      maxPolarAngle={1.43}
      enableDamping={false}
    />
  );
}

function Bus({
  vehicle,
  selected,
  onSelect,
  showTag,
}: {
  vehicle: Vehicle;
  selected: boolean;
  onSelect: (id: string) => void;
  showTag: boolean;
}) {
  const { scene } = useGLTF(MODEL);
  const paint = useMemo(() => {
    const material = new MeshStandardMaterial({
      color: new Color(vehicle.paint),
      metalness: 0.16,
      roughness: 0.35,
    });
    material.name = "Livery";
    return material;
  }, [vehicle.paint]);
  useEffect(() => () => paint.dispose(), [paint]);
  const object = useMemo(() => {
    const instance = scene.clone(true);
    instance.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material.name === "Livery") child.material = paint;
      }
    });
    return instance;
  }, [scene, paint]);
  return (
    <group position={[vehicle.x, 0.018, vehicle.z]}>
      <primitive
        object={object}
        onClick={(event: { stopPropagation: () => void }) => {
          event.stopPropagation();
          onSelect(vehicle.id);
        }}
        onPointerOver={(event: { stopPropagation: () => void }) => {
          event.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      />
      {selected && (
        <>
          <mesh position={[0, 0.027, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[3.48, 12.8]} />
            <meshBasicMaterial
              color="#3cf0bc"
              opacity={0.24}
              transparent
              depthWrite={false}
            />
          </mesh>
          {(
            [
              [0, 0.054, 6.45, 3.57, 0.065],
              [0, 0.054, -6.45, 3.57, 0.065],
              [-1.78, 0.054, 0, 0.065, 12.96],
              [1.78, 0.054, 0, 0.065, 12.96],
            ] as const
          ).map(([x, y, z, w, d], i) => (
            <mesh key={i} position={[x, y, z]}>
              <boxGeometry args={[w, 0.028, d]} />
              <meshBasicMaterial color="#69ffcf" toneMapped={false} />
            </mesh>
          ))}
          {showTag && (
            <Html
              position={[0, 3.7, 0]}
              center
              zIndexRange={[12, 0]}
              style={{ pointerEvents: "none" }}
            >
              <div className="bus-tag">
                <BusFront size={18} />
                <strong>{vehicle.id}</strong>
                <span>{vehicle.line}</span>
              </div>
            </Html>
          )}
        </>
      )}
    </group>
  );
}

function Ready({ onReady }: { onReady: () => void }) {
  const { gl: renderer, invalidate } = useThree();
  useEffect(() => {
    if (!renderer.getContext().isContextLost()) {
      renderer.shadowMap.needsUpdate = true;
      invalidate();
      onReady();
    }
  }, [renderer, invalidate, onReady]);
  return null;
}

class SceneError extends Component<
  { children: ReactNode; fallback: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  componentDidCatch() {
    this.props.onFailure();
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ObservedTerrain({
  ring,
  extent,
}: {
  ring: [number, number][];
  extent: number;
}) {
  const outline = useMemo(
    () =>
      ring.length
        ? new Shape(ring.map(([x, z]) => new Vector2(x, -z)))
        : new Shape(),
    [ring],
  );
  return (
    <>
      <mesh
        position={[0, -0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[extent * 6, extent * 6]} />
        <meshStandardMaterial color="#bec8bb" />
      </mesh>
      {ring.length > 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[outline]} />
          <meshStandardMaterial color="#819e92" side={2} />
        </mesh>
      )}
    </>
  );
}

export function Scene({
  vehicles,
  selected,
  onSelect,
  action,
  onReady,
  onFailure,
  demo,
  area,
}: {
  vehicles: Vehicle[];
  selected: string | null;
  onSelect: (id: string) => void;
  action: CameraAction;
  onReady: () => void;
  onFailure: () => void;
  demo: boolean;
  area?: Area;
}) {
  const ring = useMemo(
    () =>
      area ? area.ring.map((point) => localPoint(area.origin, point)) : [],
    [area],
  );
  const extent = Math.max(
    27,
    ...ring.map(([x, z]) => Math.max(Math.abs(x), Math.abs(z))),
  );

  const fallback = (
    <div className="canvas-notice">
      Cena 3D indisponível. A lista de veículos continua acessível.
    </div>
  );
  return (
    <SceneError fallback={fallback} onFailure={onFailure}>
      <Canvas
        orthographic
        shadows
        dpr={[1, 1.4]}
        frameloop="demand"
        fallback={fallback}
        camera={{
          position: DEFAULT_VIEW.toArray(),
          zoom: 18,
          near: 0.1,
          far: 22000,
        }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.shadowMap.autoUpdate = false;
          gl.shadowMap.needsUpdate = true;
        }}
        aria-label="Pátio de ônibus em 3D"
      >
        <color attach="background" args={["#c8dce9"]} />
        {demo && <fog attach="fog" args={["#c8dce9", 92, 150]} />}
        <hemisphereLight
          color="#e0efff"
          groundColor="#968b73"
          intensity={1.38}
        />
        <directionalLight
          color="#fff4dd"
          intensity={2.85}
          position={[-24, 44, 25]}
          castShadow
          shadow-mapSize={[1536, 1536]}
          shadow-camera-left={-36}
          shadow-camera-right={36}
          shadow-camera-top={34}
          shadow-camera-bottom={-33}
          shadow-camera-far={110}
          shadow-normalBias={0.025}
          shadow-bias={-0.00015}
        />
        <CameraRig action={action} extent={extent} />
        <Suspense fallback={null}>
          {demo ? <Scenery /> : <ObservedTerrain ring={ring} extent={extent} />}
          {vehicles.map((vehicle) => (
            <Bus
              key={vehicle.id}
              vehicle={vehicle}
              selected={selected === vehicle.id}
              onSelect={onSelect}
              showTag={action.type !== "top" && action.type !== "profile"}
            />
          ))}
          <Ready onReady={onReady} />
        </Suspense>
      </Canvas>
    </SceneError>
  );
}
