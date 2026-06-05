import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Shared building blocks for the mini-tools. Pure presentational; colors come
 *  from the CSS variables exposed as Tailwind tokens (bg-void/stage, text-pulse…). */

export function ToolCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-white/[0.08] bg-stage p-5 md:p-6", className)}>
      {children}
    </div>
  );
}

export function ToolLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-white/45">
      {children}
    </label>
  );
}

export function ToolTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-[180px] w-full resize-y rounded-lg border border-white/[0.08] bg-void px-3.5 py-3 font-mono text-[13px] leading-relaxed text-white/90 outline-none placeholder:text-white/25 focus:border-white/20",
        props.className,
      )}
    />
  );
}

export function ToolSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "rounded-lg border border-white/[0.08] bg-void px-3 py-2 text-[13px] text-white/90 outline-none focus:border-white/20",
        props.className,
      )}
    />
  );
}

export function ToolButton({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary"
          ? "bg-pulse text-white hover:bg-pulse/90"
          : "border border-white/[0.1] text-white/80 hover:bg-white/[0.05]",
        className,
      )}
    />
  );
}

/** End-of-tool funnel CTA — drives to the full engine in plain language
 *  (SYLLARY.md §10: no model/vendor/tech names). */
export function ToolFunnelCta() {
  return (
    <div className="mt-8 rounded-2xl border border-pulse/25 bg-pulse/[0.06] p-5 md:p-6">
      <h2 className="text-[18px] font-medium tracking-tight text-white">
        Want the finished files — and more?
      </h2>
      <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-white/65">
        Upload your own track and Syllary transcribes it, times every word, and gives you every
        lyrics format, a shareable lyrics page, and a synced lyric video — all from one upload.
      </p>
      <Link
        to="/"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-pulse px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-pulse/90"
      >
        Upload your track
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

/** Read a chosen text file into a string (used by the paste-or-upload tools). */
export function readTextFile(file: File): Promise<string> {
  return file.text();
}

/** Inline error for the metered (sign-in) tools: maps 401 → sign-in prompt,
 *  402 → upgrade prompt, anything else → the message. */
export function ToolAuthNotice({ error }: { error: unknown }) {
  const status = error instanceof ApiError ? error.status : 0;
  if (status === 401) {
    return (
      <p className="mt-3 text-[13px] text-white/70">
        <Link to="/sign-in" className="text-pulse hover:underline">
          Sign in
        </Link>{" "}
        to use this tool — it&apos;s free to start.
      </p>
    );
  }
  if (status === 402) {
    return (
      <p className="mt-3 text-[13px] text-white/70">
        You&apos;re out of tokens.{" "}
        <Link to="/upgrade" className="text-pulse hover:underline">
          Upgrade
        </Link>{" "}
        for more.
      </p>
    );
  }
  return (
    <p className="mt-3 text-[13px] text-pulse">
      {error instanceof Error ? error.message : "Something went wrong."}
    </p>
  );
}
