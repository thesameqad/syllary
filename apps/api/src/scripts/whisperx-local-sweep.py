"""
Sweep WhisperX decode params locally to find a combo that doesn't drop
chorus repetitions in heavily-repetitive songs. Run with:

    python whisperx-local-sweep.py <audio_path> [model_name]

Default model is large-v2 (matches the Fast-mode Replicate wrapper exactly).
For Normal/Pro parity use `large-v3`.

The script loads the model fresh for each variant because WhisperX's asr/vad
options are set at load time. On CPU this is slow (~30s/variant load); pass
CUDA_VISIBLE_DEVICES=0 if you have a GPU.

Outputs: console summary + JSON dumps under apps/api/src/scripts/debug-local/.
"""

import json
import os
import sys
import time
from pathlib import Path

try:
    import torch
    import whisperx
except ImportError as e:
    print(f"ERROR: missing dependency ({e}). Try:")
    print("  pip install whisperx torch")
    sys.exit(1)

if len(sys.argv) < 2:
    print("usage: python whisperx-local-sweep.py <audio_path> [model_name]")
    sys.exit(1)

AUDIO_PATH = sys.argv[1]
MODEL = sys.argv[2] if len(sys.argv) > 2 else "large-v2"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"
LANGUAGE = "en"

print(f"audio:   {AUDIO_PATH}")
print(f"model:   {MODEL}")
print(f"device:  {DEVICE} ({COMPUTE_TYPE})\n")

if not Path(AUDIO_PATH).exists():
    print(f"ERROR: file not found: {AUDIO_PATH}")
    sys.exit(1)

audio = whisperx.load_audio(AUDIO_PATH)
print(f"audio length: {len(audio) / 16000:.2f}s\n")

# Each variant overrides a subset of decode knobs. `vad_options` and
# `asr_options` are both load-time settings in WhisperX.
VARIANTS = [
    # Reproduce the current shipped Replicate config — confirms we can
    # reproduce the failure locally before testing fixes.
    {
        "label": "current_shipped",
        "vad_options": {"vad_onset": 0.05, "vad_offset": 0.363},
        "asr_options": {},
    },
    # Single most-promising fix for repetition suppression.
    {
        "label": "no_cond_prev",
        "vad_options": {"vad_onset": 0.05, "vad_offset": 0.363},
        "asr_options": {"condition_on_previous_text": False},
    },
    # Disable Whisper's compression-ratio fallback — stops it from dropping
    # a segment when its transcript looks "too repetitive".
    {
        "label": "no_compression_check",
        "vad_options": {"vad_onset": 0.05, "vad_offset": 0.363},
        "asr_options": {"compression_ratio_threshold": 999.0},
    },
    # Combine the two.
    {
        "label": "no_cond_no_compression",
        "vad_options": {"vad_onset": 0.05, "vad_offset": 0.363},
        "asr_options": {
            "condition_on_previous_text": False,
            "compression_ratio_threshold": 999.0,
        },
    },
    # Everything off: previous-context off, compression check off, lenient
    # no-speech threshold, full temperature fallback.
    {
        "label": "max_recovery",
        "vad_options": {"vad_onset": 0.05, "vad_offset": 0.363},
        "asr_options": {
            "condition_on_previous_text": False,
            "compression_ratio_threshold": 999.0,
            "no_speech_threshold": 0.3,
            "temperatures": [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
        },
    },
]

out_dir = Path(__file__).parent / "debug-local"
out_dir.mkdir(exist_ok=True)


# Load the Wav2Vec2 align model once and reuse across variants (it's
# expensive and doesn't depend on the ASR-side options).
print("loading align model …")
align_model, align_metadata = whisperx.load_align_model(language_code=LANGUAGE, device=DEVICE)
print()


def run_variant(variant):
    label = variant["label"]
    print(f"--- {label} ---")
    print(f"  asr_options: {variant['asr_options']}")
    t0 = time.time()
    model = whisperx.load_model(
        MODEL,
        DEVICE,
        compute_type=COMPUTE_TYPE,
        language=LANGUAGE,
        vad_options=variant["vad_options"],
        asr_options=variant["asr_options"],
    )
    load_t = time.time() - t0
    t1 = time.time()
    result = model.transcribe(audio, batch_size=16, language=LANGUAGE)
    transcribe_t = time.time() - t1
    # WhisperX alignment step — this is what the Replicate wrapper runs when
    # align_output=true, and what fills in per-word timestamps for the splitter.
    t2 = time.time()
    aligned = whisperx.align(
        result["segments"], align_model, align_metadata, audio, DEVICE, return_char_alignments=False
    )
    align_t = time.time() - t2
    print(f"  load: {load_t:.1f}s  transcribe: {transcribe_t:.1f}s  align: {align_t:.1f}s")
    segs = aligned.get("segments", [])
    print(f"  segments after align: {len(segs)}")
    total_words = 0
    for i, s in enumerate(segs):
        start = float(s.get("start", 0))
        end = float(s.get("end", 0))
        text = (s.get("text", "") or "").strip()
        words = s.get("words", []) or []
        total_words += len(words)
        print(f"    L{i:>2}  {start:>6.2f}s – {end:>6.2f}s  words={len(words):>3}  {text!r}")
        # Inline the first few + last few words so we can see if alignment
        # actually pinned them or just gave them the segment-level start.
        if words:
            sample = []
            for w in words[:4]:
                sample.append(f"{w.get('word', '')}@{w.get('start', '?')}-{w.get('end', '?')}")
            if len(words) > 4:
                sample.append("…")
                for w in words[-2:]:
                    sample.append(f"{w.get('word', '')}@{w.get('start', '?')}-{w.get('end', '?')}")
            print(f"        {' | '.join(sample)}")
    print(f"  total words: {total_words}")
    (out_dir / f"{label}.json").write_text(
        json.dumps({"variant": variant, "raw": result, "aligned": aligned}, indent=2, default=str)
    )
    del model
    if DEVICE == "cuda":
        torch.cuda.empty_cache()
    print()


for v in VARIANTS:
    try:
        run_variant(v)
    except Exception as e:
        import traceback
        print(f"  variant {v['label']!r} failed: {e}")
        traceback.print_exc()
        print()

print(f"\nAll variant outputs saved to: {out_dir}")
print("\nLook for the variant with 8 chorus repetitions caught — that's the combo to ship.")
