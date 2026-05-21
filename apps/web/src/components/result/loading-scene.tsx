import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { createNoise2D } from "simplex-noise";
import * as THREE from "three";
import type { SongStage } from "@syllary/shared";

const COUNT = 64;
const SPACING = 0.16;
const BASELINE = -2.1;

const SEPARATING_COLOR = "#FF7A3D";
const TRANSCRIBING_COLOR = "#FF2D2D";

function Bars({ stage, reducedMotion }: { stage: SongStage | null; reducedMotion: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const noise2D = useMemo(() => createNoise2D(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const { pointer } = useThree();
  const intensity = useRef(0.7);

  const color = stage === "transcribing" ? TRANSCRIBING_COLOR : SEPARATING_COLOR;
  const geometry = useMemo(() => new THREE.BoxGeometry(0.09, 1, 0.09), []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.6,
        toneMapped: false,
      }),
    [color],
  );

  const xs = useMemo(() => {
    const half = (COUNT - 1) / 2;
    return Array.from({ length: COUNT }, (_, i) => (i - half) * SPACING);
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((s) => {
    if (!mesh.current) return;
    if (typeof document !== "undefined" && document.hidden) return;

    const t = reducedMotion ? 0 : s.clock.elapsedTime;
    // Mouse height → intensity: bottom of screen = calm, top = pumping.
    const target = reducedMotion ? 0.7 : THREE.MathUtils.lerp(0.35, 2.2, (pointer.y + 1) / 2);
    intensity.current = THREE.MathUtils.lerp(intensity.current, target, 0.08);

    for (let i = 0; i < COUNT; i++) {
      const x = xs[i] ?? 0;
      const n = Math.abs(noise2D(i * 0.18, t * 0.85));
      const h = 0.15 + n * 2.0 * intensity.current;
      dummy.position.set(x, BASELINE + h / 2, 0);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, COUNT]} />;
}

export default function LoadingScene({
  stage,
  reducedMotion,
}: {
  stage: SongStage | null;
  reducedMotion: boolean;
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.3, 7], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <ambientLight intensity={0.7} />
      <pointLight position={[0, 3, 5]} intensity={22} color="#FF2D2D" />
      <Bars stage={stage} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
