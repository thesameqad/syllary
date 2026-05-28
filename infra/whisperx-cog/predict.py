"""Cog Predictor for Syllary's WhisperX. Mirrors the local sweep config that
caught all 8 chorus reps where the public victor-upmeet/whisperx wrapper
caught 4. Returns the same JSON shape victor-upmeet/whisperx returns (a top-
level `segments` list with per-segment `words`) so the Syllary backend can
drop in zero code changes besides the model slug.

Runnable two ways:
  - Inside a Replicate Cog container (`cog predict ...`).
  - Directly as a Python script for local parity tests:
        py -3 predict.py <audio_path>
    Auto-detects CUDA; falls back to CPU/int8 if no GPU is available.
"""
import json
import os
import sys
from typing import Optional

import torch
import whisperx
from cog import BasePredictor, Input, Path


def _pick_device() -> tuple[str, str]:
    if torch.cuda.is_available():
        # int8_float16 (mixed) on CUDA: lower VRAM than pure float16, but
        # supported on GPU by faster-whisper (unlike pure int8 which is
        # CPU-friendly mostly). Safer fallback if float16 hits stability
        # issues on T4.
        return "cuda", "int8_float16"
    return "cpu", "int8"


class Predictor(BasePredictor):
    def setup(self) -> None:
        # Run at container start; the loaded models stay in memory for
        # subsequent run() calls. Cold-boot also runs the build-time
        # pre-download from cog.yaml if the cache is empty.
        self.device, self.compute_type = _pick_device()
        self.language = "en"
        sys.stderr.write(
            f"[predict.setup] device={self.device} compute_type={self.compute_type}\n"
        )

        # vad_options + asr_options are load-time in WhisperX. We bake in
        # the values our local sweep proved work — the important one is
        # vad_offset=0.363 paired with pyannote.audio 3.3.2.
        self.model = whisperx.load_model(
            "large-v2",
            self.device,
            compute_type=self.compute_type,
            language=self.language,
            vad_options={"vad_onset": 0.05, "vad_offset": 0.363},
            asr_options={},
        )
        self.align_model, self.align_metadata = whisperx.load_align_model(
            language_code=self.language, device=self.device
        )

    def run(
        self,
        audio_file: Path = Input(description="Audio file to transcribe"),
        temperature: float = Input(
            default=0.0, description="Whisper sampling temperature (currently informational only — set at setup time)"
        ),
        initial_prompt: Optional[str] = Input(
            default=None, description="Optional decoder prompt (currently informational only)"
        ),
        align_output: bool = Input(
            default=True,
            description="Run Wav2Vec2 forced alignment to populate per-word timestamps",
        ),
    ) -> dict:
        def log(msg: str) -> None:
            sys.stderr.write(f"[predict.run] {msg}\n")
            sys.stderr.flush()

        path = str(audio_file)
        log(f"loading audio: {path}")
        audio = whisperx.load_audio(path)
        log(f"audio length: {len(audio) / 16000:.2f}s")

        # Sanity-check the GPU is actually usable before handing off to
        # faster-whisper. If torch's first CUDA op fails here, we'll see a
        # python traceback instead of a silent worker death.
        try:
            log(f"cuda.is_available={torch.cuda.is_available()}")
            if torch.cuda.is_available():
                log(f"cuda device: {torch.cuda.get_device_name(0)}")
                log(f"cuda mem free: {torch.cuda.mem_get_info()[0] / 1e9:.2f} GB")
                # Force a tiny tensor op to confirm cuDNN/CUDA actually work.
                t = torch.zeros(4, device="cuda")
                t = t + 1
                torch.cuda.synchronize()
                log(f"cuda probe ok: {t.tolist()}")
        except Exception as e:
            log(f"cuda probe FAILED: {type(e).__name__}: {e}")
            raise

        # NOTE: WhisperX's FasterWhisperPipeline.transcribe() doesn't accept
        # temperature/initial_prompt as kwargs — those are load-time
        # asr_options.
        _ = (temperature, initial_prompt)

        # batch_size=4 is the safe choice for a 16 GB T4. Lower if we hit OOM.
        log("calling model.transcribe(batch_size=4)…")
        try:
            result = self.model.transcribe(audio, batch_size=4, language=self.language)
            log(f"transcribe ok: {len(result.get('segments', []))} segments")
        except Exception as e:
            log(f"transcribe FAILED: {type(e).__name__}: {e}")
            raise

        if align_output and result.get("segments"):
            try:
                aligned = whisperx.align(
                    result["segments"],
                    self.align_model,
                    self.align_metadata,
                    audio,
                    self.device,
                    return_char_alignments=False,
                )
                segments = aligned.get("segments", [])
                sys.stderr.write(f"[predict.run] align ok: {len(segments)} segments\n")
            except Exception as e:
                sys.stderr.write(f"[predict.run] align FAILED: {type(e).__name__}: {e}\n")
                raise
        else:
            segments = result.get("segments", [])

        # Shape the response exactly like victor-upmeet/whisperx so the
        # Syllary backend can swap the model slug without touching its parser.
        return {
            "segments": [
                {
                    "start": float(s.get("start", 0)),
                    "end": float(s.get("end", 0)),
                    "text": (s.get("text", "") or "").strip(),
                    "words": [
                        {
                            "word": w.get("word", ""),
                            "start": float(w.get("start", s.get("start", 0))),
                            "end": float(w.get("end", s.get("end", 0))),
                        }
                        for w in (s.get("words") or [])
                    ],
                }
                for s in segments
            ],
            "detected_language": result.get("language", self.language),
        }


if __name__ == "__main__":
    # Direct-Python local parity test — bypasses Cog entirely. cog.Path
    # extends pathlib.PurePosixPath which can't be instantiated on Windows;
    # we pass a plain string, and run() str()s it before whisperx touches it.
    if len(sys.argv) < 2:
        sys.stderr.write("usage: python predict.py <audio_path>\n")
        sys.exit(1)
    p = Predictor()
    p.setup()
    out = p.run(audio_file=sys.argv[1])  # type: ignore[arg-type]
    segs = out.get("segments", [])
    sys.stderr.write(f"\n=== {len(segs)} segments ===\n")
    for i, s in enumerate(segs):
        sys.stderr.write(
            f"  L{i:>2} {s['start']:>6.2f}s – {s['end']:>6.2f}s  words={len(s['words']):>3}  {json.dumps(s['text'])}\n"
        )
    out_path = os.path.join(os.path.dirname(__file__), "predict-test-output.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    sys.stderr.write(f"\nfull JSON saved to: {out_path}\n")
