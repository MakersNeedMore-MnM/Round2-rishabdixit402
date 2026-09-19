"use client";

import { useCallback, useEffect, useState } from "react";
import { Wand2, Check, EyeOff, RotateCcw, Trash2, Sparkles, FileCode2, CheckCircle2, Code2 } from "lucide-react";
import { useActiveRepo } from "@/components/shell";
import { Pill, ConfidencePill, TabButton, EmptyState, LoadingDots, Modal } from "@/components/ui";
import { cx } from "@/lib/utils";

interface Item {
  id: string;
  type: string;
  target: string;
  filePath: string;
  confidence: string;
  description: string;
  preview: string | null;
  status: string;
}

const TYPE_META: Record<string, { label: string; tone: "lime" | "blue" | "amber" | "rose" | "default" }> = {
  unused_import: { label: "Unused import", tone: "lime" },
  dead_function: { label: "Dead function", tone: "amber" },
  dead_class: { label: "Dead class", tone: "amber" },
  unused_dependency: { label: "Unused dep", tone: "blue" },
  duplicate_utility: { label: "Duplicate", tone: "rose" },
  obsolete_file: { label: "Obsolete file", tone: "default" },
};

export default function JanitorPage() {
  const repoId = useActiveRepo();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [previewItem, setPreviewItem] = useState<Item | null>(null);

  const load = useCallback(async () => {
    if (!repoId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/repositories/${repoId}/cleanup`);
      if (res.ok) {
        const json = await res.json();
        setItems(json.cleanup);
      }
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(item: Item, status: string) {
    const prev = items;
    setItems((l) => l.map((x) => (x.id === item.id ? { ...x, status } : x)));
    const res = await fetch(`/api/cleanup/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) setItems(prev);
  }

  async function remove(item: Item) {
    const prev = items;
    setItems((l) => l.filter((x) => x.id !== item.id));
    const res = await fetch(`/api/cleanup/${item.id}`, { method: "DELETE" });
    if (!res.ok) setItems(prev);
  }

  async function approveAll() {
    const pending = filtered.filter((i) => i.status === "pending");
    for (const p of pending) {
      setItems((l) => l.map((x) => (x.id === p.id ? { ...x, status: "approved" } : x)));
      await fetch(`/api/cleanup/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
    }
  }

  const filtered = items.filter((i) => {
    if (filter === "all") return true;
    if (filter === "pending" || filter === "approved" || filter === "dismissed" || filter === "applied") return i.status === filter;
    return i.type === filter;
  });

  const pending = items.filter((i) => i.status === "pending").length;
  const approved = items.filter((i) => i.status === "approved").length;
  const types = [...new Set(items.map((i) => i.type))];

  if (!repoId || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingDots label="Loading cleanup items..." />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Top Header & Toolbar */}
      <div className="rounded-lg border border-white/[0.08] bg-[#0c1017] p-3 sm:p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-400/10 text-violet-300">
              <Wand2 className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-sm font-bold text-slate-100">Code Janitor · Automated Cleanup</h1>
              <p className="text-[11px] text-slate-400">
                Safe dead-code detection with diff previews. Nothing is deleted silently.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone="amber">{pending} pending</Pill>
            <Pill tone="lime">{approved} approved</Pill>
            {pending > 0 && (
              <button
                onClick={approveAll}
                className="inline-flex items-center gap-1 rounded-md bg-lime-300 px-3 py-1 text-xs font-bold text-[#0a0f0a] hover:bg-lime-200"
              >
                <Sparkles className="h-3 w-3" /> Approve all
              </button>
            )}
          </div>
        </div>

        {/* Filter buttons */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Filter:</span>
          {["all", "pending", "approved", "applied", "dismissed", ...types].map((f) => (
            <TabButton
              key={f}
              active={filter === f}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {TYPE_META[f]?.label ?? f}
            </TabButton>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5 text-lime-400" />}
          title="No cleanup items found"
          hint="No dead code or unused imports detected for this filter. Run re-analysis after your next commit."
        />
      ) : (
        <div className="rounded-lg border border-white/[0.08] bg-[#0c1017] p-2.5 sm:p-3 space-y-2">
          <div className="flex items-center justify-between px-1 pb-1 text-xs text-slate-400 border-b border-white/[0.05]">
            <span className="font-bold text-slate-300">Cleanup Queue</span>
            <span className="font-mono text-[11px]">{filtered.length} items</span>
          </div>

          <div className="space-y-2">
            {filtered.map((item) => {
              const meta = TYPE_META[item.type] ?? { label: item.type, tone: "default" as const };

              return (
                <div
                  key={item.id}
                  className={cx(
                    "rounded-md border p-3 transition-colors",
                    item.status === "pending"
                      ? "border-white/[0.07] bg-white/[0.015] hover:bg-white/[0.03]"
                      : "border-white/[0.04] bg-white/[0.008] opacity-75"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill tone={meta.tone}>{meta.label}</Pill>
                      <ConfidencePill confidence={item.confidence} />
                      {item.status !== "pending" && (
                        <span className="rounded bg-white/10 px-1.5 py-0.2 font-mono text-[10px] text-slate-300 uppercase">
                          {item.status}
                        </span>
                      )}
                    </div>
                    <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                      <FileCode2 className="h-3 w-3 text-slate-500" />
                      {item.filePath}
                    </span>
                  </div>

                  <div className="mt-1.5">
                    <span className="font-mono text-xs font-bold text-slate-100">{item.target}</span>
                    <p className="mt-0.5 text-xs text-slate-300 leading-relaxed">{item.description}</p>
                  </div>

                  {/* Actions toolbar */}
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-white/[0.05] pt-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.preview && (
                        <button
                          onClick={() => setPreviewItem(item)}
                          className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-lime-300 hover:bg-white/5 transition-colors"
                        >
                          <Code2 className="h-3 w-3" /> View Diff
                        </button>
                      )}

                      {item.status === "pending" && (
                        <>
                          <button
                            onClick={() => setStatus(item, "approved")}
                            className="inline-flex items-center gap-1 rounded-md bg-lime-300 px-3 py-1 text-xs font-bold text-[#0a0f0a] hover:bg-lime-200"
                          >
                            <Check className="h-3 w-3" /> Approve
                          </button>
                          <button
                            onClick={() => setStatus(item, "applied")}
                            className="rounded-md border border-[#58a6ff]/30 bg-[#58a6ff]/10 px-3 py-1 text-xs font-medium text-[#79b8ff] hover:bg-[#58a6ff]/20"
                          >
                            Mark applied
                          </button>
                          <button
                            onClick={() => setStatus(item, "dismissed")}
                            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.02] px-3 py-1 text-xs font-medium text-slate-400 hover:bg-white/5"
                          >
                            <EyeOff className="h-3 w-3" /> Dismiss
                          </button>
                        </>
                      )}

                      {item.status !== "pending" && (
                        <button
                          onClick={() => setStatus(item, "pending")}
                          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.02] px-3 py-1 text-xs font-medium text-slate-300 hover:bg-white/5"
                        >
                          <RotateCcw className="h-3 w-3" /> Reopen
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => remove(item)}
                      className="inline-flex items-center gap-1 rounded-md border border-rose-500/20 px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/10"
                      title="Remove"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Diff Preview Modal Dialog Box */}
      {previewItem && (
        <Modal
          open={!!previewItem}
          onClose={() => setPreviewItem(null)}
          title={
            <>
              <Code2 className="h-4 w-4 text-lime-300" />
              <span>Cleanup Diff Preview: {previewItem.target}</span>
            </>
          }
          subtitle={`${previewItem.filePath} · ${TYPE_META[previewItem.type]?.label ?? previewItem.type}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-[#080d16] p-2 text-xs">
              <span className="font-mono text-slate-300">{previewItem.description}</span>
              <ConfidencePill confidence={previewItem.confidence} />
            </div>

            <pre className="code max-h-[360px] overflow-x-auto whitespace-pre-wrap rounded border border-white/[0.07] bg-[#080d16] p-3 text-slate-300 text-xs">
              {previewItem.preview}
            </pre>

            <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
              {previewItem.status === "pending" ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setStatus(previewItem, "approved");
                      setPreviewItem(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-lime-300 px-3 py-1.5 text-xs font-bold text-[#0a0f0a] hover:bg-lime-200"
                  >
                    <Check className="h-3.5 w-3.5" /> Approve This Cleanup
                  </button>
                  <button
                    onClick={() => {
                      setStatus(previewItem, "applied");
                      setPreviewItem(null);
                    }}
                    className="rounded-md border border-[#58a6ff]/30 bg-[#58a6ff]/10 px-3 py-1.5 text-xs font-medium text-[#79b8ff] hover:bg-[#58a6ff]/20"
                  >
                    Mark Applied
                  </button>
                </div>
              ) : (
                <span className="text-xs font-mono text-slate-400">Status: {previewItem.status}</span>
              )}

              <button
                onClick={() => setPreviewItem(null)}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
              >
                Close Dialog
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Commit Path Footer */}
      <div className="rounded-lg border border-lime-400/20 bg-lime-400/[0.04] p-3 text-xs leading-relaxed text-slate-300">
        <span className="font-bold text-lime-300">Workflow: </span>
        Approve cleanup suggestions → Resolve open safety findings → Re-run impact analyzer for changed symbols → Export audit trail into PR description.
      </div>
    </div>
  );
}
