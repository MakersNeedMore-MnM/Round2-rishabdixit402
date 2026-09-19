"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  Loader2,
  CheckCheck,
  EyeOff,
  RotateCcw,
  CheckCircle2,
  FileCode2,
  Info,
  FolderGit2,
  AlertTriangle,
} from "lucide-react";
import { useActiveRepo } from "@/components/shell";
import { SeverityPill, TabButton, EmptyState, LoadingDots, Modal } from "@/components/ui";
import { cx } from "@/lib/utils";

interface Finding {
  id: string;
  ruleId: string;
  severity: string;
  title: string;
  description: string;
  filePath: string;
  symbol: string | null;
  lineStart: number | null;
  status: string;
  aiExplanation: string | null;
  evidence: {
    files: string[];
    symbols: string[];
    lines?: Array<{ file: string; line: number; snippet: string }>;
    relationship?: string;
    suggestion?: string;
  };
}

const RULE_LABELS: Record<string, string> = {
  removed_field_reference: "Removed field ref",
  function_signature_change: "Signature change",
  api_contract_change: "API contract",
  auth_missing: "Auth missing",
  sensitive_exposure: "Secret exposure",
  null_access: "Null access",
  risky_migration: "Risky migration",
  missing_test: "Missing test",
};

const SEVERITY_DOT: Record<string, string> = {
  high: "bg-rose-400",
  medium: "bg-amber-400",
  low: "bg-sky-400",
  passed: "bg-lime-400",
};

export default function SafetyPage() {
  const repoId = useActiveRepo();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [sevFilter, setSevFilter] = useState("all");
  const [selected, setSelected] = useState<Finding | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [provider, setProvider] = useState("");
  const [showAiModal, setShowAiModal] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!repoId) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/repositories/${repoId}/findings`);
      if (res.ok) {
        const json = await res.json();
        setFindings(json.findings);
        if (json.findings.length > 0 && !selected) {
          setSelected(json.findings.find((f: Finding) => f.severity === "high") ?? json.findings[0]);
        }
      } else {
        setFindings([]);
        setLoadError(res.status === 404 ? "Repository not found — it may have been deleted. Pick another repo from the sidebar." : `Could not load findings (HTTP ${res.status}).`);
      }
    } catch {
      setFindings([]);
      setLoadError("Could not reach the server. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }, [repoId, selected]);

  // Mount/repo-switch effect: runs once per repoId. `selected` is deliberately
  // omitted from `load`'s deps to keep the initial auto-pick stable.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    load();
  }, [repoId]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  async function explain(f: Finding) {
    setExplaining(true);
    try {
      const res = await fetch(`/api/findings/${f.id}/explain`, { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        const updated = { ...f, aiExplanation: json.explanation };
        setSelected(updated);
        setFindings((list) => list.map((x) => (x.id === f.id ? updated : x)));
        setProvider(json.provider ?? "");
      }
    } finally {
      setExplaining(false);
    }
  }

  const handleOpenAi = async (f: Finding) => {
    setSelected(f);
    setShowAiModal(true);
    if (!f.aiExplanation) {
      await explain(f);
    }
  };

  async function setStatus(f: Finding, status: string) {
    const prev = findings;
    setFindings((l) => l.map((x) => (x.id === f.id ? { ...x, status } : x)));
    if (selected?.id === f.id) setSelected({ ...f, status });
    const res = await fetch(`/api/findings/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) setFindings(prev);
  }

  const filtered = findings.filter((f) => {
    if (sevFilter === "all") return true;
    if (sevFilter === "open") return f.status === "open";
    return f.severity === sevFilter;
  });

  const openCount = findings.filter((f) => f.status === "open").length;
  const counts = {
    high: findings.filter((f) => f.severity === "high" && f.status === "open").length,
    medium: findings.filter((f) => f.severity === "medium" && f.status === "open").length,
    low: findings.filter((f) => f.severity === "low" && f.status === "open").length,
    passed: findings.filter((f) => f.severity === "passed").length,
  };

  const filterTabs: Array<{ key: string; label: string; badge: number }> = [
    { key: "all", label: "All", badge: findings.length },
    { key: "open", label: "Open", badge: openCount },
    { key: "high", label: "High", badge: findings.filter((f) => f.severity === "high").length },
    { key: "medium", label: "Med", badge: findings.filter((f) => f.severity === "medium").length },
    { key: "low", label: "Low", badge: findings.filter((f) => f.severity === "low").length },
    { key: "passed", label: "Passed", badge: counts.passed },
  ];

  if (!repoId) {
    return (
      <EmptyState
        icon={<FolderGit2 className="h-5 w-5 text-slate-400" />}
        title="No repository selected"
        hint="Add or pick a repository in the sidebar, then run an analysis to see safety findings here."
        action={
          <a href="/dashboard/repositories" className="rounded-full bg-lime-300 px-4 py-1.5 text-xs font-bold text-[#0a0f0a] hover:bg-lime-200">
            Go to repositories
          </a>
        }
      />
    );
  }

  if (loading && findings.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingDots label="Loading safety findings..." />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {loadError && (
        <div className="flex items-center justify-between gap-2 rounded-full border border-amber-400/25 bg-amber-400/[0.06] px-4 py-2 text-xs text-amber-200">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> {loadError}
          </span>
          <button onClick={load} className="rounded-full border border-amber-400/30 px-2.5 py-0.5 text-[11px] font-semibold hover:bg-amber-400/10">
            Retry
          </button>
        </div>
      )}

      {/* Slim header: title + open severity counts inline */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[13px] font-bold text-slate-200">Safety</h1>
          <span className="font-mono text-[11px] text-slate-500">
            <span className="text-rose-300">{counts.high} high</span>
            <span className="mx-1 text-slate-600">·</span>
            <span className="text-amber-300/90">{counts.medium} med</span>
            <span className="mx-1 text-slate-600">·</span>
            <span className="text-sky-300/90">{counts.low} low</span>
            <span className="mx-1 text-slate-600">·</span>
            <span className="text-lime-300/90">{counts.passed} passed</span>
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-500">{findings.length} checks</span>
      </div>

      {findings.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5 text-lime-400" />}
          title="No findings for this repository"
          hint="Run a re-analysis to refresh the deterministic safety checks."
        />
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-5">
          {/* Rule results list */}
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#0c1017] lg:col-span-2">
            <div className="border-b border-white/[0.05] px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[12.5px] font-bold text-slate-200">Rule results</h2>
                <span className="font-mono text-[11px] text-slate-500">{filtered.length}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {filterTabs.map((t) => (
                  <TabButton key={t.key} active={sevFilter === t.key} onClick={() => setSevFilter(t.key)} badge={t.badge}>
                    {t.label}
                  </TabButton>
                ))}
              </div>
            </div>

            <div className="max-h-[560px] divide-y divide-white/[0.04] overflow-y-auto scroll-thin">
              {filtered.map((f) => {
                const isSelected = selected?.id === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setSelected(f)}
                    className={cx(
                      "block w-full px-3 py-2 text-left transition-colors",
                      isSelected ? "bg-lime-400/[0.06]" : "hover:bg-white/[0.02]",
                      f.status !== "open" && "opacity-55"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", SEVERITY_DOT[f.severity] ?? "bg-slate-500")} />
                      <span className={cx("min-w-0 flex-1 truncate text-[12.5px]", isSelected ? "font-bold text-lime-200" : "font-semibold text-slate-100")}>
                        {f.title}
                      </span>
                      {f.aiExplanation && (
                        <span title="AI explanation generated">
                          <Sparkles className="h-3 w-3 shrink-0 text-violet-300" />
                        </span>
                      )}
                      {f.status !== "open" && (
                        <span className="shrink-0 font-mono text-[9.5px] uppercase text-slate-500">{f.status}</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2 pl-3.5">
                      <span className="shrink-0 font-mono text-[10px] font-bold uppercase text-slate-400">
                        {RULE_LABELS[f.ruleId] ?? f.ruleId}
                      </span>
                      <span className="min-w-0 truncate font-mono text-[10.5px] text-slate-500">{f.filePath}</span>
                    </div>
                  </button>
                );
              })}

              {filtered.length === 0 && (
                <p className="py-10 text-center text-xs text-slate-500">No findings match this filter.</p>
              )}
            </div>
          </div>

          {/* Detail panel */}
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#0c1017] lg:col-span-3">
            {selected ? (
              <div className="flex h-full flex-col">
                {/* Detail header: severity + rule + AI action */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] px-3.5 py-2.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <SeverityPill severity={selected.severity} />
                    <span className="font-mono text-[10.5px] font-bold uppercase text-slate-400">
                      {RULE_LABELS[selected.ruleId] ?? selected.ruleId}
                    </span>
                    {selected.evidence.relationship && (
                      <span className="font-mono text-[10.5px] text-slate-500">via {selected.evidence.relationship}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleOpenAi(selected)}
                    className={cx(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors",
                      selected.aiExplanation
                        ? "border border-violet-400/40 bg-violet-400/15 text-violet-200 hover:bg-violet-400/25"
                        : "bg-violet-500/90 text-white hover:bg-violet-500"
                    )}
                  >
                    <Sparkles className="h-3 w-3 text-violet-300" />
                    {selected.aiExplanation ? "View AI Explanation" : "Explain with AI"}
                  </button>
                </div>

                <div className="flex-1 space-y-3 px-3.5 py-3">
                  <div>
                    <h2 className="text-[13px] font-bold text-slate-100">{selected.title}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">{selected.description}</p>
                    {selected.symbol && (
                      <code className="mt-1.5 inline-block rounded bg-white/[0.04] px-2 py-0.5 font-mono text-[11.5px] text-lime-300">
                        {selected.symbol}
                      </code>
                    )}
                  </div>

                  {/* Evidence */}
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Evidence · {selected.evidence.files.length} files
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">{selected.filePath}</span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {selected.evidence.files.map((f) => (
                        <span key={f} className="rounded bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-slate-300">
                          {f}
                        </span>
                      ))}
                    </div>

                    {(selected.evidence.lines ?? []).length > 0 && (
                      <div className="mt-2 space-y-1">
                        {(selected.evidence.lines ?? []).slice(0, 6).map((l, i) => (
                          <div key={i} className="flex items-center gap-2 rounded bg-white/[0.03] px-2 py-1 font-mono text-[11px]">
                            <FileCode2 className="h-3 w-3 shrink-0 text-slate-600" />
                            <span className="shrink-0 text-[10px] text-[#79b8ff]">
                              {l.file.split("/").pop()}:{l.line}
                            </span>
                            <code className="truncate text-slate-300">{l.snippet}</code>
                          </div>
                        ))}
                      </div>
                    )}

                    {selected.evidence.suggestion && (
                      <div className="mt-2 rounded-lg border border-lime-400/20 bg-lime-400/[0.04] p-2 text-xs leading-relaxed text-lime-100">
                        <span className="font-bold text-lime-300">Fix: </span>
                        {selected.evidence.suggestion}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setStatus(selected, "resolved")}
                      className="inline-flex items-center gap-1.5 rounded-full bg-lime-300 px-3.5 py-1.5 text-[11.5px] font-bold text-[#0a0f0a] hover:bg-lime-200"
                    >
                      <CheckCheck className="h-3.5 w-3.5" /> Mark Resolved
                    </button>
                    <button
                      onClick={() => setStatus(selected, "acknowledged")}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-[11.5px] font-medium text-slate-300 hover:bg-white/5"
                    >
                      Acknowledge
                    </button>
                    <button
                      onClick={() => setStatus(selected, "dismissed")}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11.5px] font-medium text-slate-400 hover:bg-white/5"
                    >
                      <EyeOff className="h-3 w-3" /> Dismiss
                    </button>
                  </div>

                  {selected.status !== "open" && (
                    <button
                      onClick={() => setStatus(selected, "open")}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11.5px] font-medium text-slate-300 hover:bg-white/5"
                    >
                      <RotateCcw className="h-3 w-3" /> Reopen
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-slate-500">
                Select a finding from the list on the left to inspect details.
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Explanation Modal */}
      {selected && (
        <Modal
          open={showAiModal}
          onClose={() => setShowAiModal(false)}
          title={
            <>
              <Sparkles className="h-4 w-4 text-violet-300" />
              <span>AI Risk & Root-Cause Explanation</span>
            </>
          }
          subtitle={`${RULE_LABELS[selected.ruleId] ?? selected.ruleId} · ${selected.filePath}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-3">
            {explaining && !selected.aiExplanation ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8">
                <Loader2 className="h-5 w-5 animate-spin text-violet-300" />
                <p className="text-xs text-slate-400">
                  Synthesizing AST evidence, call hierarchy & code context...
                </p>
              </div>
            ) : selected.aiExplanation ? (
              <div className="rounded-lg border border-violet-400/20 bg-violet-400/[0.04] p-3.5">
                <div className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-200">
                  {selected.aiExplanation}
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-slate-400">
                Click below to request an instant deterministic root-cause analysis from the AI model.
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400">
              <Info className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span>
                Privacy safe: Only rule metadata, symbol name & AST snippet are sent. Full repo source and .env secrets are never transmitted.
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
              <button
                onClick={() => {
                  setStatus(selected, "resolved");
                  setShowAiModal(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-lime-300 px-3.5 py-1.5 text-[11.5px] font-bold text-[#0a0f0a] hover:bg-lime-200"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark Resolved
              </button>

              <button
                onClick={() => setShowAiModal(false)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-[11.5px] text-slate-300 hover:bg-white/5"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
