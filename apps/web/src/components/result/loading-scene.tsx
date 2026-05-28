import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { createNoise2D } from "simplex-noise";
import * as THREE from "three";
import type { SongStage } from "@syllary/shared";

const COUNT = 64;
const SPACING = 0.16;
// Bars are pushed further down so the ball has clear headroom to fly without
// leaving the camera view.
const BASELINE = -2.6;
// Hard cap on how high the ball can go. Sits comfortably inside the camera
// frustum so the ball is always on screen. A faint horizontal line is drawn
// here as a visible cue.
const CEILING_Y = 2.4;
// Max bar height multiplier — kept low enough that bars and ball never push
// each other outside the visible band.
const MAX_INTENSITY = 1.5;

const SEPARATING_COLOR = "#FF7A3D";
const TRANSCRIBING_COLOR = "#FF2D2D";

// --- Mini-game tuning -------------------------------------------------------
// The ball lives at x=0 and falls under gravity onto the bars; bars moving
// upward kick the ball up. Tuned so a great pull just barely slams the ball
// into the ceiling and a relaxed mouse keeps it bouncing gently on the bars.
const BALL_R = 0.16;
const GRAVITY = 11.5;
const RESTITUTION = 0.72;
const CEILING_RESTITUTION = 0.55;
const BAR_KICK = 1.55;
const MAX_VY = 8.5;
const BALL_START_Y = 1.2;
// One world-unit ≈ this many "metres" in the HUD. Purely cosmetic — it just
// makes the scoreboard read like a real height instead of "0.84".
const UNITS_PER_METRE = 0.55;

export type GameStats = { height: number; max: number; ceilingHits: number };

function Game({
  stage,
  reducedMotion,
  onStats,
}: {
  stage: SongStage | null;
  reducedMotion: boolean;
  onStats: (s: GameStats) => void;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const ball = useRef<THREE.Mesh>(null);
  const noise2D = useMemo(() => createNoise2D(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const { pointer } = useThree();
  const intensity = useRef(0.7);
  const ballState = useRef({
    y: BALL_START_Y,
    vy: 0,
    maxHeight: 0,
    ceilingHits: 0,
    // Was the ball touching the ceiling on the previous frame? Used to count
    // each impact exactly once instead of incrementing while it slides along.
    touchingCeiling: false,
  });
  const prevHeights = useRef<Float32Array>(new Float32Array(COUNT));
  const lastStatsAt = useRef(0);

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

  useFrame((s, delta) => {
    if (!mesh.current) return;
    if (typeof document !== "undefined" && document.hidden) return;

    // Clamp dt so a tab-restore doesn't fling the ball off-screen.
    const dt = Math.min(delta, 1 / 30);
    const t = reducedMotion ? 0 : s.clock.elapsedTime;
    const target = reducedMotion
      ? 0.7
      : THREE.MathUtils.lerp(0.35, MAX_INTENSITY, (pointer.y + 1) / 2);
    intensity.current = THREE.MathUtils.lerp(intensity.current, target, 0.08);

    let bestBarTop = -Infinity;
    let bestBarVel = 0;

    for (let i = 0; i < COUNT; i++) {
      const x = xs[i] ?? 0;
      const n = Math.abs(noise2D(i * 0.18, t * 0.85));
      const h = 0.15 + n * 2.0 * intensity.current;
      const barTop = BASELINE + h;
      // Bar's vertical velocity from one frame to the next — what makes the
      // ball jump higher when the user pumps the mouse up at the right moment.
      const prevTop = BASELINE + prevHeights.current[i]!;
      const barVel = (barTop - prevTop) / Math.max(dt, 1e-4);
      prevHeights.current[i] = h;

      dummy.position.set(x, BASELINE + h / 2, 0);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);

      // The ball sits at x=0; only bars within its radius can hit it.
      if (Math.abs(x) <= BALL_R + SPACING * 0.6 && barTop > bestBarTop) {
        bestBarTop = barTop;
        bestBarVel = barVel;
      }
    }
    mesh.current.instanceMatrix.needsUpdate = true;

    // --- Ball physics -------------------------------------------------------
    ballState.current.vy -= GRAVITY * dt;
    ballState.current.y += ballState.current.vy * dt;

    const ballBottom = ballState.current.y - BALL_R;
    if (ballBottom <= bestBarTop && Number.isFinite(bestBarTop)) {
      ballState.current.y = bestBarTop + BALL_R;
      // Bounce: absorb the bar's upward velocity (timing reward) and reflect
      // the ball's own downward velocity (free passive bouncing).
      const fromBar = Math.max(0, bestBarVel) * BAR_KICK;
      const fromBall = Math.max(0, -ballState.current.vy) * RESTITUTION;
      const vy = Math.min(MAX_VY, fromBar + fromBall);
      ballState.current.vy = vy;
    }

    // Ceiling collision — clamp the ball so it never leaves the camera view,
    // and tally each fresh impact (only on the rising-edge transition so a
    // briefly-stuck ball doesn't spam the counter).
    const atCeiling = ballState.current.y + BALL_R >= CEILING_Y;
    if (atCeiling) {
      ballState.current.y = CEILING_Y - BALL_R;
      if (!ballState.current.touchingCeiling && ballState.current.vy > 0) {
        ballState.current.ceilingHits += 1;
      }
      if (ballState.current.vy > 0) {
        ballState.current.vy = -ballState.current.vy * CEILING_RESTITUTION;
      }
    }
    ballState.current.touchingCeiling = atCeiling;

    if (ball.current) {
      ball.current.position.y = ballState.current.y;
      // Subtle squash on landing for game-feel.
      const sq = ballState.current.vy < -4 ? 0.85 : 1;
      ball.current.scale.set(1 / sq, sq, 1 / sq);
    }

    // Track + publish height a few times per second (NOT every frame — avoids
    // re-rendering the React HUD at 60Hz).
    const heightUnits = Math.max(0, ballState.current.y - BASELINE);
    if (heightUnits > ballState.current.maxHeight) {
      ballState.current.maxHeight = heightUnits;
    }
    if (s.clock.elapsedTime - lastStatsAt.current > 0.1) {
      lastStatsAt.current = s.clock.elapsedTime;
      onStats({
        height: heightUnits / UNITS_PER_METRE,
        max: ballState.current.maxHeight / UNITS_PER_METRE,
        ceilingHits: ballState.current.ceilingHits,
      });
    }
  });

  return (
    <>
      <instancedMesh ref={mesh} args={[geometry, material, COUNT]} />
      <mesh ref={ball} position={[0, BALL_START_Y, 0]}>
        <sphereGeometry args={[BALL_R, 28, 28]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive={new THREE.Color("#FF2D2D")}
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>
      {/* Visible ceiling — the ball can't fly higher than this glowing line. */}
      <mesh position={[0, CEILING_Y, 0]}>
        <boxGeometry args={[COUNT * SPACING + 0.5, 0.025, 0.02]} />
        <meshBasicMaterial
          color={new THREE.Color("#FF2D2D")}
          transparent
          opacity={0.55}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}

export default function LoadingScene({
  stage,
  reducedMotion,
  onStats,
}: {
  stage: SongStage | null;
  reducedMotion: boolean;
  onStats?: (s: GameStats) => void;
}) {
  const noop = (_s: GameStats) => {};
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.3, 7], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <ambientLight intensity={0.7} />
      <pointLight position={[0, 3, 5]} intensity={22} color="#FF2D2D" />
      <Game stage={stage} reducedMotion={reducedMotion} onStats={onStats ?? noop} />
    </Canvas>
  );
}
