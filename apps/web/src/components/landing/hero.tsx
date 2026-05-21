import { motion } from "framer-motion";
import { FormatPills } from "./format-pills";
import { HeroBackground } from "./hero-background";
import { UploadCard } from "./upload-card";

export function Hero() {
  return (
    <section id="top" className="relative min-h-[600px] overflow-hidden md:min-h-[720px]">
      <HeroBackground />

      <div className="js-hero-content relative z-[5] mx-auto max-w-[1200px] px-6 pb-32 pt-14 text-center sm:px-8 md:pb-44">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mb-7 inline-flex items-center gap-2 rounded-full border-[0.5px] border-white/[0.08] bg-white/[0.04] px-3.5 py-1.5 backdrop-blur-md"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-pulse shadow-[0_0_12px_#FF2D2D]" />
          <span className="text-[12px] tracking-[0.3px] text-white/70">
            Ready for Spotify, Apple Music & more
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut", delay: 0.05 }}
          className="mx-auto mb-[22px] max-w-[760px] text-[clamp(2.6rem,7vw,68px)] font-medium leading-[1] tracking-[-2.8px]"
        >
          Every word.
          <br />
          <span className="hero-accent">Every beat.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut", delay: 0.12 }}
          className="mx-auto mb-11 max-w-[500px] text-[19px] leading-[1.5] text-white/55"
        >
          Upload your song and get every lyrics file Spotify, Apple Music, and other
          platforms need — synced to the beat and ready in one click.
        </motion.p>

        <motion.div
          id="upload"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut", delay: 0.18 }}
          className="scroll-mt-24"
        >
          <UploadCard />
        </motion.div>

        <FormatPills />
      </div>
    </section>
  );
}
