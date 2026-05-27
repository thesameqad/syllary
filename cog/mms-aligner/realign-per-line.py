"""
Per-line MMS forced alignment.

Designed to run INSIDE the `cog-mms-aligner` docker image (which already has
torch, torchaudio, and `ctc-forced-aligner` installed). The host-side script
mounts the repo at /work, writes /work/cog/mms-aligner/mms-input.json, then
invokes this script via `docker run … python /work/cog/mms-aligner/realign-per-line.py`.

For each line we:
  1. Slice the audio tensor to a small chunk around the line's approximate
     [start, end] (from the previous coarse pass), with `padding_sec`
     breathing room on each side.
  2. Save the chunk + the line's text to temp files (`get_word_stamps`
     only accepts file paths).
  3. Run MMS_FA forced alignment on that chunk + that line's text alone.
  4. Adjust returned word timestamps to global time (add chunk_start).

Per-line isolation kills the "wrong-Static-matched-to-wrong-line" failure
mode we hit when aligning the whole song at once — each call only sees one
"Static skin" in the audio and one in the transcript.
"""

import json
import os
import sys
import tempfile

import torch
import torchaudio
from ctc_forced_aligner import get_word_stamps

WORK_DIR = "/work"
INPUT_PATH = os.path.join(WORK_DIR, "cog", "mms-aligner", "mms-input.json")
OUTPUT_PATH = os.path.join(WORK_DIR, "cog", "mms-aligner", "mms-output.json")


def main() -> None:
    inp = json.loads(open(INPUT_PATH, "r", encoding="utf-8").read())
    audio_path = inp["audio_path"]
    lines = inp["lines"]
    padding = float(inp.get("padding_sec", 2.0))

    device = torch.device("cpu")
    bundle = torchaudio.pipelines.MMS_FA
    print("Loading MMS_FA model…", file=sys.stderr)
    model = bundle.get_model(with_star=False).to(device)
    target_sr = bundle.sample_rate
    print(f"Model loaded. target sample rate = {target_sr}", file=sys.stderr)

    print(f"Loading audio: {audio_path}", file=sys.stderr)
    full_waveform, sr = torchaudio.load(audio_path)
    if sr != target_sr:
        full_waveform = torchaudio.transforms.Resample(sr, target_sr)(full_waveform)
    if full_waveform.shape[0] > 1:
        full_waveform = full_waveform.mean(dim=0, keepdim=True)
    print(f"Audio shape={tuple(full_waveform.shape)}", file=sys.stderr)
    total_seconds = full_waveform.shape[1] / target_sr

    output_lines = []

    for line in lines:
        idx = line["index"]
        text = line["text"]
        start = max(0.0, float(line["start"]) - padding)
        end = min(total_seconds, float(line["end"]) + padding)

        s_sample = int(start * target_sr)
        e_sample = int(end * target_sr)
        chunk = full_waveform[:, s_sample:e_sample]

        if chunk.shape[1] < int(0.3 * target_sr):
            print(f"Line {idx}: chunk too short ({chunk.shape[1]} samples), skipping", file=sys.stderr)
            output_lines.append({"index": idx, "words": [], "skipped": "chunk_too_short"})
            continue

        # get_word_stamps takes file paths only, so write chunk + transcript
        # to temp files. Use .wav (uncompressed) so torchaudio loads them in
        # the library without an mp3 decoder dependency.
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as cf:
            torchaudio.save(cf.name, chunk, target_sr)
            chunk_path = cf.name
        with tempfile.NamedTemporaryFile(suffix=".txt", mode="w", delete=False, encoding="utf-8") as tf:
            tf.write(text)
            transcript_path = tf.name

        try:
            word_timestamps, _model, _lyrics = get_word_stamps(
                chunk_path, transcript_path, model=model, model_type="MMS_FA"
            )
        except Exception as e:
            print(f"Line {idx}: alignment failed: {e}", file=sys.stderr)
            output_lines.append({"index": idx, "words": [], "skipped": f"error: {e}"})
            os.unlink(chunk_path)
            os.unlink(transcript_path)
            continue
        finally:
            try:
                os.unlink(chunk_path)
                os.unlink(transcript_path)
            except OSError:
                pass

        # Adjust per-word timestamps to global timeline.
        for w in word_timestamps:
            w["start"] = float(w["start"]) + start
            w["end"] = float(w["end"]) + start

        output_lines.append({"index": idx, "words": word_timestamps})
        print(f"Line {idx}: aligned {len(word_timestamps)} words in [{start:.2f}, {end:.2f}]", file=sys.stderr)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump({"lines": output_lines}, f, indent=2)
    print(f"Wrote {OUTPUT_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
