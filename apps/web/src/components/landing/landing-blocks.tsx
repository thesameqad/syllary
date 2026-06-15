import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { LandingBlock } from "@syllary/shared";
import { ToolHost } from "@/tools/registry";

/** Interactive React renderer for landing content blocks. Mirrors the static
 *  snapshot the API produces for crawlers (renderBlocksToHtml), but mounts live
 *  mini-tools for `toolEmbed`. Colors come from CSS-variable Tailwind tokens. */
function Block({ block }: { block: LandingBlock }) {
  switch (block.kind) {
    case "heading":
      return block.level === 2 ? (
        <h2 className="mt-10 text-[26px] font-medium tracking-[-0.5px] text-white">{block.text}</h2>
      ) : (
        <h3 className="mt-7 text-[19px] font-medium tracking-[-0.3px] text-white">{block.text}</h3>
      );
    case "paragraph":
      return <p className="mt-3 text-[15px] leading-[1.7] text-white/70">{block.text}</p>;
    case "callout":
      return (
        <aside className="mt-5 rounded-xl border border-white/[0.08] bg-stage px-4 py-3.5 text-[14px] leading-relaxed text-white/75">
          {block.text}
        </aside>
      );
    case "list": {
      const cls = "mt-3 space-y-1.5 pl-5 text-[15px] leading-[1.7] text-white/70";
      const items = block.items.map((it, i) => (
        <li key={i} className="marker:text-white/35">
          {it}
        </li>
      ));
      return block.ordered ? (
        <ol className={`list-decimal ${cls}`}>{items}</ol>
      ) : (
        <ul className={`list-disc ${cls}`}>{items}</ul>
      );
    }
    case "table":
      return (
        <div className="mt-5 overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="bg-white/[0.03]">
                {block.headers.map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left font-medium text-white/80">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="border-t border-white/[0.06]">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-4 py-2.5 text-white/65">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "cta":
      return (
        <Link
          to={block.href}
          className="mt-6 inline-flex items-center rounded-lg bg-pulse px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-pulse/90"
        >
          {block.label}
        </Link>
      );
    case "image":
      return (
        <img
          src={block.src}
          alt={block.alt}
          loading="lazy"
          className="mt-5 w-full rounded-xl border border-white/[0.08]"
        />
      );
    case "toolEmbed":
      return (
        <div className="mt-6">
          <ToolHost toolKey={block.toolKey} />
        </div>
      );
    case "badges":
      return (
        <div className="mt-6 flex flex-wrap gap-2">
          {block.items.map((b, i) => (
            <span
              key={i}
              className={
                i === 0
                  ? "rounded-md border border-pulse/30 bg-pulse/[0.1] px-2.5 py-1 text-[12px] font-medium text-pulse"
                  : "rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[12px] text-white/65"
              }
            >
              {b}
            </span>
          ))}
        </div>
      );
    case "steps":
      return (
        <div className="mt-6 space-y-3">
          {block.items.map((s, i) => (
            <div
              key={i}
              className="flex items-start gap-4 rounded-2xl border border-white/[0.06] bg-stage px-5 py-4"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pulse text-[13px] font-medium text-white">
                {i + 1}
              </span>
              <div>
                <div className="text-[15px] font-medium text-white">{s.title}</div>
                {s.text && <div className="mt-0.5 text-[14px] leading-relaxed text-white/55">{s.text}</div>}
              </div>
            </div>
          ))}
        </div>
      );
    case "code":
      return (
        <div className="mt-6">
          <pre className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-void px-5 py-4">
            <code className="block font-mono text-[13px] leading-[1.9] text-white/85">
              {block.code.split("\n").map((line, i) => (
                <div key={i}>{highlightTags(line)}</div>
              ))}
            </code>
          </pre>
          {block.caption && (
            <p className="mt-2 text-[13px] text-white/45">{highlightTags(block.caption)}</p>
          )}
        </div>
      );
    case "ctaCard":
      return (
        <div className="mt-8 max-w-2xl rounded-2xl border border-pulse/25 bg-pulse/[0.06] p-5 md:p-6">
          <h2 className="text-[18px] font-medium tracking-tight text-white">{block.title}</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-white/65">{block.text}</p>
          <Link
            to={block.href}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-pulse px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-pulse/90"
          >
            {block.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      );
    case "relatedLinks":
      return (
        <div className="mt-10">
          <p className="mb-3 text-[12px] uppercase tracking-[0.12em] text-white/40">
            {block.title ?? "Related"}
          </p>
          <div className="flex flex-wrap gap-2">
            {block.items.map((l, i) => (
              <Link
                key={i}
                to={l.href}
                className="rounded-lg border border-white/[0.1] px-3 py-2 text-[13px] text-white/75 transition-colors hover:border-white/20 hover:text-white"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      );
    case "definition":
      return (
        <p className="mt-4 border-l-2 border-pulse/50 pl-4 text-[16px] leading-[1.7] text-white/85">
          <span className="font-medium text-white">{block.term}</span> — {block.text}
        </p>
      );
  }
}

/** Light-highlight bracketed LRC tags (`[mm:ss.xx]`, `<..>`) in accent color. */
function highlightTags(text: string): React.ReactNode {
  const parts = text.split(/(\[[^\]]*\]|<[^>]*>)/g);
  return parts.map((part, i) =>
    /^[[<]/.test(part) ? (
      <span key={i} className="text-pulse">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function LandingBlocks({ blocks }: { blocks: LandingBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </>
  );
}
