import { motion } from "framer-motion";

const FORMATS = [".lrc", ".lrc enhanced", ".ttml", ".srt", ".vtt", ".txt", ".json"];

export function FormatPills() {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.3 } } }}
      className="mt-12 flex flex-wrap items-center justify-center gap-2.5"
    >
      <span className="mr-2 text-[11px] uppercase tracking-[1.5px] text-white/30">
        You get
      </span>
      {FORMATS.map((format) => (
        <motion.span
          key={format}
          variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
          className="rounded-full border-[0.5px] border-white/[0.08] bg-white/[0.06] px-3 py-[5px] font-mono text-[11px] text-white/70"
        >
          {format}
        </motion.span>
      ))}
    </motion.div>
  );
}
