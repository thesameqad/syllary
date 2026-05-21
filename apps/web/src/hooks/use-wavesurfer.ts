import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

export function useWavesurfer(audioUrl: string | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !audioUrl) return;

    const ws = WaveSurfer.create({
      container,
      url: audioUrl,
      height: 64,
      waveColor: "rgba(255,255,255,0.18)",
      progressColor: "#FF2D2D",
      cursorColor: "rgba(255,255,255,0.45)",
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
    });
    wsRef.current = ws;

    ws.on("ready", () => setIsReady(true));
    ws.on("timeupdate", (t: number) => setCurrentTime(t));
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    return () => {
      ws.destroy();
      wsRef.current = null;
      setIsReady(false);
      setIsPlaying(false);
      setCurrentTime(0);
    };
  }, [audioUrl]);

  const playPause = () => wsRef.current?.playPause();
  const seek = (seconds: number) => wsRef.current?.setTime(seconds);

  return { containerRef, isReady, isPlaying, currentTime, playPause, seek };
}
