import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { HEIGHT, LEFT_X, MID_Y, POINT_W, RIGHT_X, WIDTH } from "../board/geometry";

/** One animated throw: which values land where. */
export interface DiceThrow {
  readonly seq: number;
  /** Values and the board half (0 = right/white, 1 = left/black) each die lands in. */
  readonly dice: readonly { readonly value: number; readonly half: 0 | 1 }[];
}

export interface Dice3DProps {
  readonly roll: DiceThrow;
  readonly faceColor: string;
  readonly pipColor: string;
  readonly onDone: (seq: number) => void;
  /** Board drawn turned by 90° (portrait phones): board (x, y) appears at (HEIGHT - y, x). */
  readonly rotated?: boolean;
  /** Board mirrored left/right (home board on the left). */
  readonly mirrored?: boolean;
}

const DURATION = 0.95;
const DIE_SIZE = 54;

/** Face order of BoxGeometry materials: +X, -X, +Y, -Y, +Z, -Z (opposite faces sum to 7). */
const FACE_VALUES = [3, 4, 2, 5, 1, 6] as const;
const FACE_NORMALS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
};

const faceTexture = (value: number, face: string, pip: string): THREE.CanvasTexture => {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = face;
  g.fillRect(0, 0, size, size);
  g.fillStyle = pip;
  for (const [dx, dy] of PIPS[value]!) {
    g.beginPath();
    g.arc(size / 2 + dx * size * 0.27, size / 2 + dy * size * 0.27, size * 0.1, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const easeOut = (t: number) => 1 - (1 - t) ** 3;

function Die({
  value,
  target,
  start,
  materials,
  scale,
  delay,
  onSettled,
}: {
  value: number;
  target: THREE.Vector2;
  start: THREE.Vector2;
  materials: THREE.Material[];
  scale: number;
  delay: number;
  onSettled: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const t0 = useRef<number | null>(null);
  const settled = useRef(false);
  const geometry = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 4, 0.14), []);
  const { finalQ, axis, spins } = useMemo(() => {
    const idx = FACE_VALUES.indexOf(value as (typeof FACE_VALUES)[number]);
    const q = new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[idx]!, new THREE.Vector3(0, 0, 1));
    const twist = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      (Math.random() - 0.5) * 0.8,
    );
    return {
      finalQ: twist.multiply(q),
      axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() * 0.3).normalize(),
      spins: 3 + Math.random() * 2,
    };
  }, [value]);

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    t0.current ??= state.clock.elapsedTime + delay;
    const t = Math.min(1, Math.max(0, (state.clock.elapsedTime - t0.current) / DURATION));
    const e = easeOut(t);
    const pos = start.clone().lerp(target, e);
    // Bounces: the die looks bigger while "in the air".
    const lift = Math.abs(Math.sin(e * Math.PI * 2.5)) * (1 - e) * 0.55;
    mesh.position.set(pos.x * scale, pos.y * scale, 50);
    mesh.scale.setScalar(DIE_SIZE * scale * (1 + lift));
    const tumble = new THREE.Quaternion().setFromAxisAngle(axis, (1 - e) * spins * Math.PI * 2);
    mesh.quaternion.copy(tumble.multiply(finalQ));
    if (t >= 1 && !settled.current) {
      settled.current = true;
      onSettled();
    }
  });

  return <mesh ref={ref} geometry={geometry} material={materials} castShadow />;
}

function Scene({ roll, faceColor, pipColor, onDone, rotated = false, mirrored = false }: Dice3DProps) {
  const { size } = useThree();
  const scale = size.width / (rotated ? HEIGHT : WIDTH);
  const materials = useMemo(
    () =>
      FACE_VALUES.map(
        (v) =>
          new THREE.MeshStandardMaterial({
            map: faceTexture(v, faceColor, pipColor),
            roughness: 0.35,
            metalness: 0.05,
          }),
      ),
    [faceColor, pipColor],
  );
  const pending = useRef(roll.dice.length);
  // biome-ignore lint/correctness/useExhaustiveDependencies: restart counting for every throw
  useEffect(() => {
    pending.current = roll.dice.length;
  }, [roll.seq]);

  // Board coordinates (SVG units) -> scene coordinates centred on the board.
  const toScene = (bx: number, y: number) => {
    const x = mirrored ? WIDTH - bx : bx;
    return rotated
      ? new THREE.Vector2(HEIGHT - y - HEIGHT / 2, WIDTH / 2 - x)
      : new THREE.Vector2(x - WIDTH / 2, HEIGHT / 2 - y);
  };
  const halfCenter = (half: 0 | 1) => (half === 0 ? RIGHT_X + 3 * POINT_W : LEFT_X + 3 * POINT_W);
  const gap = DIE_SIZE + 14;
  const byHalf: Record<0 | 1, number[]> = { 0: [], 1: [] };
  roll.dice.forEach((d, i) => {
    byHalf[d.half].push(i);
  });

  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[-300, 400, 600]} intensity={2.2} />
      {roll.dice.map((d, i) => {
        const group = byHalf[d.half];
        const slot = group.indexOf(i);
        const x = halfCenter(d.half) + (slot - (group.length - 1) / 2) * gap;
        const target = toScene(x, MID_Y);
        // Thrown in from the player's side of the board.
        const start = toScene(d.half === 0 ? x + 260 : x - 260, MID_Y + (i % 2 === 0 ? -140 : 120));
        return (
          <Die
            // biome-ignore lint/suspicious/noArrayIndexKey: dice of one throw are positional
            key={`${roll.seq}-${i}`}
            value={d.value}
            target={target}
            start={start}
            materials={materials}
            scale={scale}
            delay={i * 0.06}
            onSettled={() => {
              pending.current--;
              if (pending.current === 0) onDone(roll.seq);
            }}
          />
        );
      })}
    </>
  );
}

/** Transparent WebGL overlay that throws the dice across the board. */
export default function Dice3D(props: Dice3DProps) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 1000], zoom: 1, near: 1, far: 3000 }}
      gl={{ alpha: true, antialias: true }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      dpr={[1, 2]}
    >
      <Scene {...props} />
    </Canvas>
  );
}
