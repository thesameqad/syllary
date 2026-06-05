import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import type { LandingAdmin, LandingFunnel } from "@syllary/shared";
import {
  deleteLandingPage,
  getLandingAnalytics,
  listLandingPages,
  setLandingPublished,
} from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { AdminGuard } from "./admin-guard";

type SortKey = "visits" | "freeSongs" | "registrations" | "registeredSongs" | "upgrades";

type Row = LandingAdmin & { funnel: LandingFunnel | null };

function upgradeTotal(f: LandingFunnel | null): number {
  if (!f) return 0;
  return Object.values(f.upgradesByPlan).reduce((a, b) => a + b, 0);
}

function metric(row: Row, key: SortKey): number {
  const f = row.funnel;
  if (!f) return 0;
  if (key === "upgrades") return upgradeTotal(f);
  return f[key];
}

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

function LandingListInner() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>("visits");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [pages, funnels] = await Promise.all([listLandingPages(), getLandingAnalytics()]);
      const byslug = new Map(funnels.map((f) => [f.slug, f]));
      setRows(pages.map((p) => ({ ...p, funnel: byslug.get(p.slug) ?? null })));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not load pages.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => metric(b, sort) - metric(a, sort)),
    [rows, sort],
  );

  async function togglePublish(row: Row) {
    setBusy(row.id);
    try {
      await setLandingPublished(row.id, row.status !== "published");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: Row) {
    if (!window.confirm(`Delete "${row.title}"? This can't be undone.`)) return;
    setBusy(row.id);
    try {
      await deleteLandingPage(row.id);
      setRows((rs) => rs.filter((r) => r.id !== row.id));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete.", "error");
    } finally {
      setBusy(null);
    }
  }

  const Header = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      className={`cursor-pointer px-3 py-2 text-right font-medium tabular-nums transition-colors hover:text-white ${
        sort === k ? "text-white" : "text-white/45"
      }`}
      onClick={() => setSort(k)}
    >
      {label}
    </th>
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-tight text-white">Landing pages</h1>
          <p className="mt-1 text-[13px] text-white/50">
            Acquisition funnel per page — visits → free song → register → registered songs → upgrade.
          </p>
        </div>
        <Link
          to="/admin/landing/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-pulse px-3.5 py-2 text-[13px] font-medium text-white hover:bg-pulse/90"
        >
          <Plus className="h-4 w-4" /> New page
        </Link>
      </div>

      {loading ? (
        <p className="text-[14px] text-white/50">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-white/[0.08] bg-stage px-4 py-8 text-center text-[14px] text-white/50">
          No landing pages yet. Create your first one.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.1em]">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-white/45">Page</th>
                <Header k="visits" label="Visits" />
                <Header k="freeSongs" label="Free songs" />
                <Header k="registrations" label="Registered" />
                <Header k="registeredSongs" label="Reg. songs" />
                <Header k="upgrades" label="Upgrades" />
                <th className="px-3 py-2 text-right font-medium text-white/45">Reg %</th>
                <th className="px-3 py-2 text-right font-medium text-white/45" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const f = row.funnel;
                const upgrades = upgradeTotal(f);
                return (
                  <tr key={row.id} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{row.title}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                            row.status === "published"
                              ? "bg-success/15 text-success"
                              : "bg-white/[0.06] text-white/45"
                          }`}
                        >
                          {row.status}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-white/35">/{row.slug}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-white/80">{f?.visits ?? 0}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-white/80">{f?.freeSongs ?? 0}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-white/80">
                      {f?.registrations ?? 0}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-white/80">
                      {f?.registeredSongs ?? 0}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-white/80">
                      {upgrades > 0 ? (
                        <span title={Object.entries(f?.upgradesByPlan ?? {}).map(([p, c]) => `${p}: ${c}`).join(", ")}>
                          {upgrades}
                        </span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-white/55">
                      {pct(f?.registrations ?? 0, f?.visits ?? 0)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5 text-white/55">
                        <a
                          href={`/${row.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded p-1 hover:bg-white/[0.06] hover:text-white"
                          title="View page"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <Link
                          to={`/admin/landing/${row.id}`}
                          className="rounded p-1 hover:bg-white/[0.06] hover:text-white"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          disabled={busy === row.id}
                          onClick={() => void togglePublish(row)}
                          className="rounded px-1.5 py-0.5 text-[11px] hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                        >
                          {row.status === "published" ? "Unpublish" : "Publish"}
                        </button>
                        <button
                          disabled={busy === row.id}
                          onClick={() => void remove(row)}
                          className="rounded p-1 hover:bg-pulse/15 hover:text-pulse disabled:opacity-40"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function LandingListPage() {
  return (
    <AdminGuard>
      <LandingListInner />
    </AdminGuard>
  );
}
