import "../load-env.js";
import { structureLyrics } from "../lib/openrouter.js";

const fragments = [
  "I've been driving down the FDR Talking to your voicemail like you're there",
  "It's been a year and I can't tell If I'm doing fine or just doing well",
  "And the streetlights blur into a line And I'm asking questions I won't answer You're the",
  "only thing I miss tonight You're the only thing I miss It's Brooklyn in November",
  "And the sky is full of rain",
  "I wouldn't trade this feeling for anything again",
  "It's Brooklyn in November",
  "And I'm finally awake",
  "Some things you have to lose before you know What's a stay?",
  "There's a coffee shop on Bedford Ave Where we used to read the papers in the",
  "back You'd order black, I'd order cream We'd argue softly over what it means",
  "And the streetlights blur into a line And I'm asking questions I won't answer You're the",
  "only thing I miss tonight You're the only thing I miss It's Brooklyn in November",
  "And the sky's full of rain",
  "I wouldn't trade this feeling for anything again",
  "It's Brooklyn in November",
  "and I'm finally awake",
  "Some things you have to lose before you know what sad state I've been through",
  "It's Brooklyn in November and I'm finally awake",
];

const r = await structureLyrics(fragments);
console.log("---result---");
console.log("null?", r === null);
console.log("lines:", r?.lines.length);
console.log("sections:", JSON.stringify(r?.sections));
console.log("first 3 lines:", r?.lines.slice(0, 3));
