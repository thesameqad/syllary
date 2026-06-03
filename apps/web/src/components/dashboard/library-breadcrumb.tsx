import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; onClick?: () => void };

/** Breadcrumb trail for Library drill-down (e.g. Artists › Foo › Bar). The last
 *  crumb is the current view (not clickable); earlier crumbs navigate back up. */
export function LibraryBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-[13px]">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-white/30" />}
            {c.onClick && !last ? (
              <button
                type="button"
                onClick={c.onClick}
                className="text-white/55 transition-colors hover:text-white"
              >
                {c.label}
              </button>
            ) : (
              <span className={cn(last ? "font-medium text-white" : "text-white/55")}>
                {c.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
