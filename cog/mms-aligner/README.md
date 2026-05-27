# mms-aligner cog

Forced-alignment service for Syllary lyrics. Replaces WhisperX's bundled
wav2vec2-base-960h with Meta's MMS-300M via [MahmoudAshraf97/ctc-forced-aligner](https://github.com/MahmoudAshraf97/ctc-forced-aligner),
because LibriSpeech-trained wav2vec2 fails on sung / screamed / whispered
vocals (timestamps drift seconds early, words squashed at section boundaries).

Target slug: `r8.im/syllary/mms-aligner`.

## Prerequisites

- **Docker Desktop**, running. (Cog is a wrapper around Docker; the GPU base
  image is ~3 GB.)
- **Cog CLI**. On Windows the simplest path is downloading the latest
  prebuilt binary from
  [github.com/replicate/cog/releases](https://github.com/replicate/cog/releases) —
  grab `cog_Windows_x86_64.exe`, rename to `cog.exe`, drop it on your PATH
  (e.g. `C:\Users\<you>\bin\cog.exe`). Restart your shell so the new PATH
  entry takes effect.
- **NVIDIA GPU + drivers** for the local test to actually run the GPU path.
  Without a GPU, you can still build the image but `cog predict` will fall
  back to CPU and take 60-90s per minute of audio.
- **Replicate account + API token** — only needed for the `cog push` step at
  the end. Local testing requires nothing on replicate.com.

## Local test loop

The point of this directory is to validate MMS produces meaningfully better
timestamps than the current pipeline **before** pushing anything to Replicate.

### 1. Build the image (one-time, ~10 min)

```bash
cd cog/mms-aligner
cog build
```

Cog will pull the CUDA-12.1 base, install torch + ctc-forced-aligner, and
cache the MMS-300M weights on first model load.

### 2. Run a prediction against `3.mp3`

The aligner needs the **vocals stem**, not the raw mix — make sure to point
at an isolated-vocals file (Demucs output) once one is available locally.
For a quick sanity check, the raw mp3 will work but quality drops.

```bash
# Prepare a transcript string. The text doesn't need exact line breaks —
# the aligner re-tokenises internally. For 3.mp3, use uploads/3.txt as a
# starting point.
TRANSCRIPT=$(cat ../../uploads/3.txt)

cog predict \
  -i audio=@../../uploads/3.mp3 \
  -i transcript="$TRANSCRIPT" \
  -i language=eng \
  > /tmp/mms-out.json
```

Output is a JSON array of `{text, start, end, score}` per word.

### 3. Compare with current WhisperX output

The existing Pro-mode row in Supabase for `3.mp3` already has the WhisperX
word-level timings. Eyeball the same problem region (the bridge → pre-chorus
transition around 1:59 / 119-127s, and the line 15 → 16 chorus around
72-79s) and check whether MMS:

- Puts "I'd never come back" at ~127s (when the guy actually screams it)
  instead of 123.98s.
- Aligns the screamed chorus lines ("Static skin, paper thin", etc.) at all
  rather than dropping them.
- Avoids the within-line 4s gap on "Tear the paper up… master plans".

If MMS lands those three regions cleanly, it's worth deploying.

## Deploy to Replicate

Only after local validation says MMS is meaningfully better.

```bash
# One-time
cog login           # paste your Replicate API token

# Push (first push uploads ~3 GB GPU image, subsequent pushes are fast)
cog push r8.im/syllary/mms-aligner
```

Before the first push you'll need to create the model on
[replicate.com/syllary](https://replicate.com/syllary) → New Model →
name `mms-aligner` → set visibility (private is fine, your `REPLICATE_API_TOKEN`
authenticates).

After the push, point Syllary's transcription pipeline at it:

1. In [apps/api/src/lib/replicate.ts](../../apps/api/src/lib/replicate.ts),
   set `align_output: false` in `startOneTranscription`.
2. Add a new helper that calls `syllary/mms-aligner` with the reconciled
   lyrics text + the Demucs vocals URL.
3. In `apps/api/src/lib/transcript.ts`, replace the `alignLines` /
   `mergeWords` path for word-level timing with the cog's response.

(Wiring code lives outside this directory.)

## License notes

- The library itself (`ctc-forced-aligner`) is BSD-3.
- The default weights (`MahmoudAshraf/mms-300m-1130-forced-aligner`) are
  CC-BY-NC, which **blocks commercial use**. Before deploying for paid
  tiers, switch the model in `setup()` to the original
  [`facebook/mms-300m`](https://huggingface.co/facebook/mms-300m)
  checkpoint (CC-BY-NC-4.0 → MIT-equivalent for the Meta release) or use a
  permissively-licensed wav2vec2-base-960h fine-tune. TODO: verify the
  license on the Meta MMS-300M base release before launch.
