/** Trailing printed-sentence punctuation that streaming platforms (Spotify,
 *  Apple Music, YouTube Music) drop from synced lyric lines: the line break
 *  already implies the pause, and seeing a period after every line reads as
 *  prose, not song. We *keep* ?, !, apostrophes, quotes, and em-dashes —
 *  those carry intonation or are part of a word's identity.
 *
 *  Apply at the rendering / export edge only. The canonical Lyrics object
 *  keeps full punctuation so .srt / .vtt / .txt / .json subtitles remain
 *  readable, and so user edits round-trip without losing characters. */
const TERMINAL_PUNCT = /[,.;:…]+\s*$/u;

export function toDisplayLine(text: string): string {
  return text.replace(TERMINAL_PUNCT, "").trimEnd();
}
