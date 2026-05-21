import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { createNoise2D } from "simplex-noise";
import * as THREE from "three";

const SPACING = 0.12;
const BASELINE = -2.4;

type BarsProps = {
  count: number;
  reducedMotion: boolean;
  parallax: boolean;
};

function Bars({ count, reducedMotion, parallax }: BarsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const noise2D = useMemo(() => createNoise2D(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const mouse = useRef({ x: 0, y: 0 });
  const staticDone = useRef(false);

  const geometry = useMemo(() => new THREE.BoxGeometry(0.07, 1, 0.07), []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#FF2D2D"),
        emissive: new THREE.Color("#FF2D2D"),
        emissiveIntensity: 0.6,
        toneMapped: false,
      }),
    [],
  );

  const xs = useMemo(() => {
    const half = (count - 1) / 2;
    return Array.from({ length: count }, (_, i) => (i - half) * SPACING);
  }, [count]);

  const zs = useMemo(
    () => Array.from({ length: count }, () => (Math.random() - 0.5) * 0.5),
    [count],
  );

  useEffect(() => {
    if (!parallax) return;
    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [parallax]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (reducedMotion && staticDone.current) return;

    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    const halfWidth = ((count - 1) / 2) * SPACING;
    const cursorX = mouse.current.x * halfWidth;
    const bulgeRadius = halfWidth * 0.36;

    for (let i = 0; i < count; i++) {
      const x = xs[i] ?? 0;
      const n = noise2D(i * 0.18, t * 0.35);
      let h = 0.25 + (n * 0.5 + 0.5) * 0.95;

      if (!reducedMotion && parallax) {
        const d = Math.abs(x - cursorX);
        if (d < bulgeRadius) {
          const falloff = (Math.cos((d / bulgeRadius) * Math.PI) + 1) / 2;
          h *= 1 + falloff * 0.6;
        }
      }

      dummy.position.set(x, BASELINE + h / 2, zs[i] ?? 0);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    if (!reducedMotion && parallax) {
      state.camera.rotation.y = THREE.MathUtils.lerp(
        state.camera.rotation.y,
        mouse.current.x * 0.02,
        0.05,
      );
      state.camera.rotation.x = THREE.MathUtils.lerp(
        state.camera.rotation.x,
        -mouse.current.y * 0.01,
        0.05,
      );
    }

    if (reducedMotion) staticDone.current = true;
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, count]} />;
}

type AudioBarsSceneProps = {
  reducedMotion: boolean;
  parallax: boolean;
  count: number;
};

/** Default export so it can be React.lazy-loaded and code-split out of the main bundle. */
export default function AudioBarsScene({
  reducedMotion,
  parallax,
  count,
}: AudioBarsSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.4, 7], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
    >
      <ambientLight intensity={0.8} />
      <pointLight position={[0, 3, 5]} intensity={18} color="#FF2D2D" />
      <Bars count={count} reducedMotion={reducedMotion} parallax={parallax} />
    </Canvas>
  );
}
