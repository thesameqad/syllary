# Syllary — Design Handoff Bundle

This folder contains everything you need to give Claude Code so it can build the landing page exactly as designed.

## What's in here

| File | What it is | Where it goes in the repo |
|---|---|---|
| `CLAUDE.md` | Project context auto-read on every Claude Code session | Repo root (`syllary/CLAUDE.md`) |
| `DESIGN-SPEC.md` | Motion + 3D + interaction spec | `syllary/docs/design/DESIGN-SPEC.md` |
| `landing-reference.html` | Static visual target — open in browser as reference | `syllary/docs/design/landing-reference.html` |
| `logo-variants.svg` | All 6 logo variants (primary, light, wordmark, mono, favicon) | `syllary/docs/design/logo-variants.svg` |

## Step-by-step: getting these into Claude Code

### 1. Create the repo and folders
```bash
mkdir syllary && cd syllary
git init
mkdir -p docs/design apps/web/public
```

### 2. Copy each file to its destination
Move the four files from this bundle into the locations in the table above.

### 3. Generate the hero video separately
Go to Higgsfield (or Runway / Kling directly) and generate a 6-second loop using the prompt in `DESIGN-SPEC.md` section A. Save as `apps/web/public/hero-bg.mp4`. Compress with:
```bash
ffmpeg -i source.mp4 -vcodec libx264 -crf 28 -preset slow -an apps/web/public/hero-bg.mp4
```
Target size: under 4MB.

### 4. Install the skill pack
From repo root:
```bash
npx skills add https://github.com/Leonxlnx/taste-skill
```

### 5. Open Claude Code
```bash
claude
```
First thing it does is read `CLAUDE.md` automatically.

### 6. Your first prompt should be exactly this
> Read CLAUDE.md and docs/design/DESIGN-SPEC.md, then scaffold the pnpm monorepo with the structure described. Set up TypeScript, Tailwind, shadcn/ui, ESLint, and Drizzle. Create the .env.example with every key we'll need. Don't write any product code yet.

Then proceed with the rest of the build sequence (see the original setup checklist).

### 7. When you reach the landing-page step (step 6 in build sequence)
Use this prompt:
> Use the gpt-taste skill. Reference docs/design/landing-reference.html as the visual target and docs/design/DESIGN-SPEC.md for all motion and 3D spec. Build the landing page in apps/web. Hero with the AI video bg at /hero-bg.mp4, upload card front-and-center, live preview section, pricing section, footer. Dark mode only. GSAP scroll-triggered choreography per the spec. Respect prefers-reduced-motion from day one.

## Why this structure works

Claude Code reads `CLAUDE.md` automatically on every session — it's the project's persistent memory. The HTML reference + spec markdown sit alongside the code as version-controlled documentation, so future builds (and any team members) inherit the same target.

When you later need to update the design, edit `DESIGN-SPEC.md` first and reference it in your prompt. Don't describe the change in chat — change the spec and tell Claude Code to re-read.

## What's intentionally NOT in this bundle

- **The hero MP4** — too large for the design bundle, and easier to regenerate fresh in Higgsfield than to ship a binary. Generate it once and check it into git via Git LFS, or store it on R2 and reference by URL.
- **Favicon binaries** — Claude Code will generate the PNG/ICO files from the SVG during the build using sharp or imagemagick.
- **Final brand colors as design tokens** — those live in the Tailwind config and CSS variables Claude Code creates.
