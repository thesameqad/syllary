# syllary-whisperx — Replicate Cog model

Pinned WhisperX stack that caught all 8 chorus reps on `uploads/4.mp3` where
`victor-upmeet/whisperx` caught only 4. The version that matters is
`pyannote.audio==3.3.2` — its VAD produces music-friendly chunk shapes that
don't trip Whisper's repetition suppression.

The output JSON shape is identical to `victor-upmeet/whisperx` (top-level
`segments` with per-segment `words`), so swapping the model slug in
[`apps/api/src/lib/replicate.ts`](../../apps/api/src/lib/replicate.ts) is the
only Syllary backend change required.

## Deploy (from Windows: use WSL)

### One-time setup

```bash
# In WSL Ubuntu (Cog officially supports Linux/macOS only)

# 1. Install Docker Desktop on Windows and enable WSL integration in:
#    Docker Desktop → Settings → Resources → WSL Integration → Ubuntu (toggle ON).
# Then in WSL:
docker --version    # should print a version, not "command not found"

# 2. Install Cog
sudo curl -o /usr/local/bin/cog -L \
  https://github.com/replicate/cog/releases/latest/download/cog_Linux_x86_64
sudo chmod +x /usr/local/bin/cog
cog --version

# 3. Get a Replicate API token from https://replicate.com/account/api-tokens
#    Then log Cog into Replicate:
cog login    # paste the token when prompted

# 4. Create the empty model on Replicate (one-time)
#    Go to https://replicate.com/create
#    - Name:      syllary-whisperx
#    - Visibility: Private (or Public — your choice)
#    - Hardware:  GPU T4 (cheapest that handles large-v2 well; can upgrade later)
```

### Push the model

From WSL, in this directory:

```bash
# Navigate to where this README lives (adjust path to your WSL view of the repo)
cd /mnt/c/Users/thesa/Documents/src/ErmanAI/syllary/infra/whisperx-cog

# Build + push. Replace <handle> with your Replicate username.
# First push downloads ~3 GB of model weights into the image — can take 10-15
# minutes. Subsequent pushes only re-upload changed layers.
cog push r8.im/<handle>/syllary-whisperx
```

When the push finishes Replicate prints a URL like
`https://replicate.com/<handle>/syllary-whisperx/versions/<sha>` — open it,
hit the "Run" tab, upload `uploads/4.mp3`, and you should see 8 segments
back. That's your green light.

### Wire the backend to the new model

In [`apps/api/src/lib/replicate.ts`](../../apps/api/src/lib/replicate.ts) replace `whisperxSlugFor`:

```ts
function whisperxSlugFor(mode: GenerationMode): { owner: string; name: string } {
  return mode === "fast"
    ? { owner: "<your-handle>", name: "syllary-whisperx" }
    : { owner: "victor-upmeet", name: "whisperx-a40-large" };
}
```

Optionally switch all three modes (`fast`, `normal`, `pro`) to the new model
once you're confident, or keep `normal`/`pro` on `whisperx-a40-large` for the
larger Whisper variant until we also push a `large-v3` build.

### Keep it warm (avoid cold-boot pain in production)

By default a model goes cold after ~5 min of no traffic; the next call pays
a 30-90s cold-start. For interactive SaaS, enable Replicate **Always On
Deployments** on this model — costs ~$1-2/day per kept-warm instance,
eliminates cold starts.

## Verify locally before pushing (optional but recommended)

Build the GPU image locally and run a prediction. Requires the WSL Docker
daemon to have GPU access (Docker Desktop → Settings → Resources → enable
NVIDIA GPU support, or use `--gpus all` if cog supports it).

```bash
cog build -t syllary-whisperx:test
cog predict -i audio_file=@/mnt/c/Users/thesa/Documents/src/ErmanAI/syllary/uploads/4.mp3
```

Output should match the 8-segment result we got from the direct-Python
parity test at [`predict-test-output.json`](./predict-test-output.json).

## Iterating on the model

When you change `predict.py` or `cog.yaml`, just `cog push` again. Replicate
versions every push; old versions stay reachable by SHA, so you can roll back
by pinning the model slug to a specific version in `replicate.ts`.

## Costs

| Hardware | $/sec | ~$/song (60s audio, ~15s inference) |
|---|---|---|
| T4 | 0.000225 | $0.003 |
| A40 | 0.000725 | $0.011 |
| L40s | 0.001028 | $0.015 |

Always-On adds the idle-time bill: T4 always-on is ~$0.81/hr × 24 = ~$19/day.
Most projects start with on-demand and only flip to Always-On when daily
traffic justifies it.
