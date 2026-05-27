"""
Forced-alignment cog for Syllary.

Takes a known transcript + vocal-isolated audio and returns word-level
[start, end] timestamps. Uses Meta's MMS_FA acoustic model via torchaudio's
bundled pipeline (wrapped by MahmoudAshraf97/ctc-forced-aligner) — chosen
over WhisperX's built-in wav2vec2-base-960h because the LibriSpeech-trained
model fails on sung / screamed / whispered vocals (timestamps drift seconds
early, words get squashed at section boundaries). MMS was trained on 1,100+
languages of varied audio and handles atypical phonation far better.

Pipeline this slots into: Whisper transcribes (no align_output) → this
cog aligns → final Lyrics.words[].start/end.
"""

from typing import Any, Dict, List

import torch
import torchaudio
from cog import BasePredictor, Input, Path

from ctc_forced_aligner import get_word_stamps


class Predictor(BasePredictor):
    def setup(self) -> None:
        """Pre-load MMS_FA bundle weights so predict() doesn't pay the cold cost."""
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        bundle = torchaudio.pipelines.MMS_FA
        # `with_star=False` matches the high-level get_word_stamps() default and
        # avoids the dictionary-mismatch error that hits when star tokens are
        # enabled here but the dictionary above is fetched without them.
        self.model = bundle.get_model(with_star=False).to(self.device)

    def predict(
        self,
        audio: Path = Input(
            description="Vocal-isolated audio (mp3 / wav / flac). "
            "Pre-run Demucs upstream — aligner quality drops sharply on raw mixes.",
        ),
        transcript: Path = Input(
            description="Plain-text transcript file. Lines may be separated by "
            "newlines; bracketed [section] headers will be ignored automatically.",
        ),
    ) -> List[Dict[str, Any]]:
        """
        Returns a list of {"text", "start", "end", "score"} dicts — one per word
        in the input transcript, in order. Scores are alignment confidences
        (higher = better phonetic match).
        """
        word_timestamps, _model, _lyrics_lines = get_word_stamps(
            str(audio),
            str(transcript),
            model=self.model,
            model_type="MMS_FA",
        )
        return word_timestamps
