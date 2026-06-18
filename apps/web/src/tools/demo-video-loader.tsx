import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, RoundedBox } from "@react-three/drei";
import type { Group } from "three";

/** The "painting your video" loader: the Syllary mark, rebuilt as red 3D bars on
 *  black, framed to fit and floating gently like a sheet of paper. The bars also
 *  bounce like an audio equaliser (a traveling wave) for life. Lazy-loaded by the
 *  demo tool (R3F is heavy) so it only ships once a render starts. */

// The exact spectrum bars from the mark (logo.tsx), in the SVG's 56×56 space.
// Every bar is centred on the baseline (y + h/2 === 28), so they only differ in
// height — an equaliser growing from the middle.
const BARS = [
  { x: 6, h: 12 },
  { x: 12, h: 24 },
  { x: 18, h: 36 },
  { x: 24, h: 20 },
  { x: 30, h: 28 },
  { x: 36, h: 16 },
  { x: 42, h: 8 },
];
const S = 0.12; // SVG units → world units
const CX = 28; // SVG horizontal centre
const W = 3 * S; // bar width
const DEPTH = 0.5; // the "3D" part — how deep each bar is
const DASHES = Array.from({ length: 11 }, (_, i) => (3 + i * 4.5 - CX) * S);

function LogoBars() {
  const bars = useRef<Group>(null);
  useFrame((state) => {
    const g = bars.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    // Equaliser bounce: each bar's height pulses, phase-offset by its index so a
    // wave travels across the mark. Centred scaling keeps the logo recognizable.
    g.children.forEach((bar, i) => {
      bar.scale.y = 1 + 0.2 * Math.sin(t * 6 + i * 0.7);
    });
  });

  return (
    // Slight base tilt so the bars read as 3D (you catch their depth); Float
    // wobbles gently around it. Nudged up so the bars + timeline sit centred.
    <group rotation={[0.12, -0.2, 0.05]} position={[0, 0.3, 0]}>
      <group ref={bars}>
        {BARS.map((b) => (
          <RoundedBox
            key={b.x}
            args={[W, b.h * S, DEPTH]}
            radius={0.06}
            smoothness={3}
            position={[(b.x + 1.5 - CX) * S, 0, 0]}
          >
            <meshStandardMaterial
              color="#FF2D2D"
              emissive="#FF2D2D"
              emissiveIntensity={0.2}
              roughness={0.32}
              metalness={0.25}
            />
          </RoundedBox>
        ))}
      </group>
      {DASHES.map((x, i) => (
        <mesh key={`d${i}`} position={[x, (CX - 50) * S, 0]}>
          <boxGeometry args={[1.7 * S, 1.7 * S, DEPTH * 0.55]} />
          <meshStandardMaterial color="#FF2D2D" emissive="#FF2D2D" emissiveIntensity={0.2} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

export default function DemoVideoLoader() {
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#000000"]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 6]} intensity={3} color="#ffffff" />
      <pointLight position={[-5, 2, 4]} intensity={2.4} color="#ff7a7a" decay={0} />
      <Float speed={7.5} rotationIntensity={0.8} floatIntensity={1.8}>
        <LogoBars />
      </Float>
    </Canvas>
  );
}
