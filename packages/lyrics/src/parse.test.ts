import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectFormat,
  parse,
  parseLrc,
  parseSrt,
  parseTtml,
  parseTxt,
  parseVtt,
} from "./parse.js";
import { generate, toLrc, toSrt } from "./generate.js";

test("parseLrc reads line timestamps and infers ends", () => {
  const lyrics = parseLrc("[ti:Demo]\n[00:01.00]first line\n[00:05.50]second line\n");
  assert.equal(lyrics.lines.length, 2);
  assert.equal(lyrics.lines[0]!.text, "first line");
  assert.equal(lyrics.lines[0]!.start, 1);
  assert.equal(lyrics.lines[0]!.end, 5.5); // inferred from next line
  assert.equal(lyrics.lines[1]!.end, 9.5); // trailing default +4s
});

test("parseLrc applies [offset:] and parses enhanced word tags", () => {
  const lyrics = parseLrc("[offset:1000]\n[00:02.00]<00:02.00>hello <00:02.50>world\n");
  // offset 1000ms shifts everything 1s earlier.
  assert.equal(lyrics.lines[0]!.start, 1);
  assert.equal(lyrics.lines[0]!.text, "hello world");
  assert.equal(lyrics.lines[0]!.words.length, 2);
  assert.equal(lyrics.lines[0]!.words[0]!.text, "hello");
  assert.equal(lyrics.lines[0]!.words[0]!.start, 1);
  assert.equal(lyrics.lines[0]!.words[1]!.start, 1.5);
});

test("parseSrt and parseVtt read cue ranges", () => {
  const srt = parseSrt("1\n00:00:01,000 --> 00:00:03,000\nhello there\n\n2\n00:00:03,000 --> 00:00:05,000\nsecond\n");
  assert.equal(srt.lines.length, 2);
  assert.equal(srt.lines[0]!.start, 1);
  assert.equal(srt.lines[0]!.end, 3);
  assert.equal(srt.lines[0]!.text, "hello there");

  const vtt = parseVtt("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nhello\n");
  assert.equal(vtt.lines[0]!.start, 1);
  assert.equal(vtt.lines[0]!.text, "hello");
});

test("parseTtml reads <p> and word spans, clock + offset times", () => {
  const ttml =
    '<tt xmlns="http://www.w3.org/ns/ttml"><body><div>' +
    '<p begin="00:00:01.000" end="00:00:03.000"><span begin="1s" end="2s">hi</span> <span begin="2s">there</span></p>' +
    "</div></body></tt>";
  const lyrics = parseTtml(ttml);
  assert.equal(lyrics.lines.length, 1);
  assert.equal(lyrics.lines[0]!.text, "hi there");
  assert.equal(lyrics.lines[0]!.start, 1);
  assert.equal(lyrics.lines[0]!.words.length, 2);
  assert.equal(lyrics.lines[0]!.words[1]!.text, "there");
});

test("parseTxt keeps lines with zeroed timing", () => {
  const lyrics = parseTxt("line one\n\nline two\n");
  assert.equal(lyrics.lines.length, 2);
  assert.equal(lyrics.lines[0]!.start, 0);
  assert.equal(lyrics.lines[0]!.text, "line one");
});

test("detectFormat sniffs each format", () => {
  assert.equal(detectFormat("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nx"), "vtt");
  assert.equal(detectFormat('<tt xmlns="http://www.w3.org/ns/ttml"></tt>'), "ttml");
  assert.equal(detectFormat("1\n00:00:01,000 --> 00:00:02,000\nx"), "srt");
  assert.equal(detectFormat("[00:01.00]hi"), "lrc");
  assert.equal(detectFormat("[00:01.00]<00:01.00>hi"), "lrc-enhanced");
  assert.equal(detectFormat("just plain words"), null);
});

test("round-trip: LRC -> internal -> SRT preserves text and timing", () => {
  const src = "[00:01.00]first\n[00:03.00]second\n";
  const lyrics = parse("lrc", src);
  const srt = toSrt(lyrics);
  assert.match(srt, /00:00:01,000 --> 00:00:03,000/);
  assert.match(srt, /first/);
  // and back through SRT parsing
  const reparsed = parseSrt(srt);
  assert.equal(reparsed.lines[0]!.start, 1);
  assert.equal(reparsed.lines[0]!.text, "first");
});

test("round-trip: SRT -> every output format generates without throwing", () => {
  const lyrics = parseSrt("1\n00:00:01,000 --> 00:00:02,000\nhello\n");
  for (const fmt of ["lrc", "lrc-enhanced", "ttml", "srt", "vtt", "txt", "json"] as const) {
    const out = generate(fmt, lyrics);
    assert.ok(out.length > 0, `${fmt} produced output`);
  }
  assert.match(toLrc(lyrics), /\[00:01\.00\]hello/);
});
