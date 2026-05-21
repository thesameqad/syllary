# Syllary — Design Specification

This is the canonical design reference. The accompanying `landing-reference.html` shows the static visual target. This document covers everything HTML can't express: motion, interactivity, the 3D scene, and the technical implementation.

---

## Brand identity

**Name:** Syllary (syllable + library — emphasizes word timing)
**Domain:** syllary.com
**Tagline / headline:** "Every word. Every beat."
**Sub-tagline:** "Upload your track. Get plain lyrics, synced LRC, Apple Music TTML, and every other format your distributor needs — validated and ready."

## Color palette

| Token | Hex | Use |
|---|---|---|
| Pulse | `#FF2D2D` | Primary CTA, active states, karaoke word highlight, playhead, on dark only |
| Ember | `#D81818` | Red on light backgrounds, favicon master color |
| Void | `#0A0A0A` | Landing page background, player background |
| Stage | `#161616` | Card surfaces on dark backgrounds |
| Paper | `#FAFAF7` | Light-mode background (auth, billing) |
| Mute | `#888888` | Secondary text on dark, dividers |
| Success | `#4ADE80` | "Platform-ready" confirmations |

CSS variables (in `app.css`):

```css
:root {
  --color-pulse: #FF2D2D;
  --color-ember: #D81818;
  --color-void: #0A0A0A;
  --color-stage: #161616;
  --color-paper: #FAFAF7;
  --color-mute: #888888;
  --color-success: #4ADE80;
  --color-text-primary: rgba(255, 255, 255, 1);
  --color-text-secondary: rgba(255, 255, 255, 0.55);
  --color-text-tertiary: rgba(255, 255, 255, 0.3);
  --color-border-subtle: rgba(255, 255, 255, 0.06);
  --color-border-default: rgba(255, 255, 255, 0.1);
}
```

## Typography

- **Font:** Inter (variable). Self-hosted via Fontsource. Two weights only: 400 and 500.
- **Hero h1:** 68px / 500 / line-height 1.0 / letter-spacing -2.8px
- **Section h2:** 36px / 500 / letter-spacing -1.2px
- **Body large:** 19px / 400 / line-height 1.5
- **Body:** 15px / 400 / line-height 1.65
- **Small / labels:** 11px / 400 / letter-spacing 1.5px / uppercase
- **Mono (file formats, code):** JetBrains Mono. Used only for `.lrc`/`.ttml` pills and any file extension or path.

Always sentence case. Never Title Case. Never ALL CAPS except 11px eyebrow labels.

## Layout

- Max content width: 1200px
- Hero section min-height: 720px (desktop), 600px (mobile)
- Section padding: 80px top/bottom on desktop, 56px on mobile
- Border radius: 14px (cards inside cards), 16px (price cards), 20px (main cards), 999px (pills/buttons)
- Border thickness: 0.5px or 1.5px (featured price card). Never 1px.

## Logo usage

See `logo-variants.svg`. The mark is "Bargroove" — seven vertical bars of varying heights over a dashed timeline, evoking an audio spectrum analyzer above a beat grid.

Rules:
- Minimum size: 16×16px (favicon variant — drop the dashed line at this size)
- Always horizontal — never rotate
- Always with timeline visible (except favicon)
- Bars never animate independently except in the loading state
- Pair with the wordmark only in nav and footer — use the mark alone everywhere else
- Clearspace: minimum 8px on all sides at any scale

## Landing page sections (in order)

1. **Nav** — sticky, glass-blur, brand left, links + Start free CTA right
2. **Hero** — badge → headline → sub → upload card → output format pills
3. **Live preview** — section header → demo card (waveform + lyric + downloads)
4. **Pricing** — section header → 3 tier cards
5. **Footer** — minimal, copyright + legal links

Deliberately NO sections in v1: testimonials, FAQ, feature deep-dives, comparison tables, blog teaser. The upload card IS the demo. Shipping short is the strategy.

---

## Motion & interactivity spec

This is what makes it "jaw-dropping." Every item below is implementation-required, not optional.

### A. Hero background — AI-generated video

- File: `apps/web/public/hero-bg.mp4`
- Aspect: 16:9, ~6 seconds, seamless loop
- Generation: Higgsfield (Kling 3.0) or Runway Gen-3
- Prompt: *"Cinematic dark recording studio interior, slow camera dolly forward at low angle, vintage Shure SM7B microphone in foreground softly lit by red light, blurred mixing console in background, deep red lens flares passing left to right, dust particles drifting in red light beams, shallow depth of field, anamorphic widescreen, ARRI Alexa cinematography, moody, no people, no text, 16:9, 6 seconds, seamless loop"*
- Compress to under 4MB with ffmpeg: `ffmpeg -i source.mp4 -vcodec libx264 -crf 28 -preset slow -an hero-bg.mp4`
- Implementation: `<video autoplay loop muted playsinline>` at 30% opacity, behind the radial gradient overlay
- Fallback: if `prefers-reduced-motion: reduce` is set, do not autoplay — show a static poster frame instead

### B. Hero foreground — React Three Fiber audio scene

The bars at the bottom of the hero are NOT static CSS. Implementation:

- Library: `@react-three/fiber` + `@react-three/drei`
- Geometry: `<InstancedMesh>` with ~80 thin vertical bars
- Position: each bar offset along X axis, slight Z-depth randomization
- Idle motion: each bar's height driven by `simplex-noise` indexed by `(barIndex, time * 0.5)`. Subtle, breathing.
- Mouse interaction: cursor position (normalized -1 to 1) creates a radial bulge — bars within distance D of cursor X get height multiplier with smooth falloff (cosine-based)
- Camera: subtle parallax — `camera.rotation.y = mouseX * 0.02`, `camera.rotation.x = -mouseY * 0.01`
- Performance: cap at 60fps via `useFrame`. Pause when tab is hidden (`Page Visibility API`).
- Mobile: reduce bar count to 40, disable mouse parallax (touch-only events)
- Color: `#FF2D2D` with emissive intensity 0.6 for the slight glow

After file upload, the same scene re-mounts as the actual audio analyzer — bars driven by `AnalyserNode.getByteFrequencyData()` from Web Audio API on the uploaded track. This is the "your song drives the visual" moment.

### C. Hero text — animated gradient

`Every beat.` uses a CSS animated gradient that slowly cycles. Plain CSS, no library:

```css
.hero-title .accent {
  background: linear-gradient(180deg, #FF6B6B, #FF2D2D, #8B0000);
  background-size: 100% 300%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: gradient-cycle 6s ease-in-out infinite;
}
@keyframes gradient-cycle {
  0%, 100% { background-position: 0% 0%; }
  50% { background-position: 0% 100%; }
}
```

### D. Upload card — magnetic glass-morphism

- Library: `framer-motion`
- Tilt: card rotates up to 5° on X and Y axes toward cursor position. Use `useSpring` for damped springiness.
- Hover state: dashed border color animates from `rgba(255,255,255,0.15)` to `#FF2D2D` over 200ms
- Drag-over state: dashed border becomes solid `#FF2D2D`, dropzone background flashes red briefly
- On file drop:
  1. Particle burst from drop point — 24 red particles, GSAP staggered out radially (300ms)
  2. Card morphs: dropzone shrinks, replaced by horizontal progress bar
  3. Progress bar fills as upload to R2 progresses (real percentage from XHR)
  4. After upload completes, bar morphs again into waveform shape (animated SVG path)
  5. Polling indicator: "Transcribing..." with the bars in hero scene now reacting to a fake idle pattern at higher intensity
  6. On result: scroll smoothly to the demo card section, populate it with real data

### E. Scroll choreography (GSAP ScrollTrigger required by gpt-taste skill)

- **Hero exit:** as user scrolls past hero, opacity fades from 1 to 0.3 between 0% and 50% scroll past hero. Slight upward translate (-40px) on the hero content.
- **Preview section entrance:** when 60% in view, demo card slides up from y=80 with 0.8s ease-out. Waveform inside draws left-to-right with 1.2s ease-out (delay 0.3s after card entrance).
- **Lyric lines:** each line fades in sequentially with 80ms stagger as section becomes visible.
- **Pricing cards:** stagger entrance from bottom, 100ms between each. Featured (Creator) card has additional 12px Y-translate up at rest (slightly raised at all times).
- **Pricing scroll parallax:** subtle 3D rotateX on cards locked to scroll velocity. Max 4°. Use GSAP `ScrollTrigger.scrub: 1`.

### F. Cursor

- Custom cursor on landing page only (NOT inside the app/dashboard).
- Default: 8px circle, `rgba(255,255,255,0.4)` outline, mix-blend-mode: difference
- Over interactive: scales to 32px with `#FF2D2D` fill, mix-blend-mode: normal, slight magnetic attraction toward button center
- Disabled on touch devices (`hover: none` media query)

### G. Reduced motion

If `prefers-reduced-motion: reduce`:
- No video autoplay (poster frame instead)
- No mouse-tracked parallax
- No magnetic cursor
- No scroll-triggered animations — content appears immediately
- Gradient cycle disabled (static gradient)
- Three.js scene still renders but in static-noise mode (no idle animation, no mouse reaction)

This is a hard requirement, not optional. Implement it from day one — retrofitting it later is painful.

---

## Performance budget

Hard limits, measured on a fast 4G connection / Lighthouse:

- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Total Blocking Time: < 300ms
- Lighthouse Performance score: > 90
- Total JS sent (gzipped, excluding hero video): < 250KB
- Hero video: lazy-loaded after critical paint, never blocks render
- Three.js bundle: dynamically imported, never on initial bundle

If you go over budget, cut the Three.js scene before you cut the video. The video does more atmosphere work per byte.

---

## Tech stack alignment (mirrors CLAUDE.md)

- Vite + React 18 + TypeScript + Tailwind + shadcn/ui (light usage — most components are custom)
- Framer Motion for component-level motion
- GSAP + ScrollTrigger for scroll choreography
- React Three Fiber + drei for the hero 3D scene
- wavesurfer.js for the player waveform
- Inter via Fontsource (self-hosted, no Google Fonts CDN)

## Skills usage

- **gpt-taste** — landing page ONLY. The hero, preview, pricing, footer. This skill enforces GSAP and high motion intensity.
- **minimalist-skill** — dashboard, player result page, settings, billing. These should feel Linear-clean, NOT Awwwards-flashy.
- **taste-skill** — auth pages and any other transactional surface. Settings: `DESIGN_VARIANCE: 6`, `MOTION_INTENSITY: 4`, `VISUAL_DENSITY: 4`.
- **output-skill** — always on, project-wide.

---

## File handoff checklist for Claude Code

When starting the landing page build, the developer should have:
- [x] `landing-reference.html` — open this in browser as visual target
- [x] `logo-variants.svg` — copy needed SVGs into React components
- [x] `DESIGN-SPEC.md` — this file, reference for all motion + interaction
- [x] `hero-bg.mp4` — generated separately via Kling, placed at `apps/web/public/hero-bg.mp4`
- [x] `CLAUDE.md` at repo root (separate file, see project setup notes)

The static HTML reference is INTENTIONALLY incomplete — it shows structure and aesthetics but no motion. Everything moving and interactive comes from this spec.
