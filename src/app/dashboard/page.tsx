"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  FileCode2,
  Network,
  ShieldCheck,
  Wand2,
  RefreshCw,
  GitBranch,
  Loader2,
  FlaskConical,
  ExternalLink,
  FolderGit2,
} from "lucide-react";
import { useActiveRepo } from "@/components/shell";
import { BubbleCard, Pill, SeverityPill, HealthRing, LoadingDots, EmptyState, StatBox } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

interface Overview {
  repository: {
    id: string;
    name: string;
    githubUrl: string;
    branch: string;
    status: string;
    description: string | null;
    lastAnalyzedAt: string | null;
  };
  stats: {
    files: number;
    entities: number;
    relationships: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    byCleanup: Record<string, number>;
    health: number;
    openFindings: number;
    pendingCleanup: number;
  };
  recentFindings: Array<{
    id: string;
    ruleId: string;
    severity: string;
    title: string;
    filePath: string;
    createdAt: string;
  }>;
  recentCleanup: Array<{
    id: string;
    type: string;
    target: string;
    filePath: string;
    confidence: string;
  }>;
  changes: Array<{
    id: string;
    symbol: string;
    changeType: string;
    filePath: string;
    createdAt: string;
  }>;
  files: Array<{ path: string; language: string; loc: number }>;
}

export default function DashboardPage() {
  const repoId = useActiveRepo();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [workspaceEmpty, setWorkspaceEmpty] = useState(false);

  const load = useCallback(async () => {
    if (!repoId) return;
    try {
      const res = await fetch(`/api/repositories/${repoId}/overview`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    load();
  }, [load]);

  // While the repository is still being scanned, keep polling so the tiles,
  // findings and file list fill in the moment the background scan finishes -
  // the user never has to refresh manually.
  useEffect(() => {
    if (!repoId) return;
    const status = data?.repository?.status;
    if (status !== "pending" && status !== "analyzing") return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [repoId, data?.repository?.status, load]);

  // useActiveRepo() stays empty when the account has no repositories at all,
  // which would otherwise leave the spinner running forever. Confirm first.
  useEffect(() => {
    if (repoId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/repositories");
        const json = res.ok ? await res.json() : null;
        if (!cancelled && json && (json.repositories ?? []).length === 0) {
          setWorkspaceEmpty(true);
        }
      } catch {
        // Ignore background fetch error
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [repoId]);

  async function reanalyze() {
    if (!repoId) return;
    setAnalyzing(true);
    try {
      await fetch(`/api/repositories/${repoId}/analyze`, { method: "POST" });
      await load();
    } finally {
      setAnalyzing(false);
    }
  }

  if (!repoId) {
    if (workspaceEmpty) {
      return (
        <EmptyState
          icon={<FolderGit2 className="h-5 w-5" />}
          title="No repositories yet"
          hint="Import one of your GitHub repositories to unlock impact, safety and cleanup intelligence here."
          action={
            <Link
              href="/dashboard/repositories"
              className="inline-flex items-center gap-1.5 rounded-md bg-lime-300 px-4 py-1.5 text-xs font-bold text-[#0a0f0a] hover:bg-lime-200"
            >
              <ArrowRight className="h-3.5 w-3.5" /> Browse repositories
            </Link>
          }
        />
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <LoadingDots label="Loading workspace..." />
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <LoadingDots label="Fetching repository overview..." />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={<FlaskConical className="h-5 w-5" />}
        title="No analysis data found"
        hint="Select a repository or click retry to trigger analysis."
        action={
          <button onClick={load} className="rounded-md bg-lime-300 px-4 py-1.5 text-xs font-bold text-[#0a0f0a]">
            Retry
          </button>
        }
      />
    );
  }

  const s = data.stats ?? {
    files: 0,
    entities: 0,
    relationships: 0,
    byType: {},
    bySeverity: {},
    byCleanup: {},
    health: 100,
    openFindings: 0,
    pendingCleanup: 0,
  };

  return (
    <div className="space-y-3">
      {/* Compact Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-[#0c1017] px-3.5 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-lime-400/10 font-mono font-bold text-lime-300 text-sm">
            {data.repository.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-bold text-slate-100">{data.repository.name}</h1>
              <Pill tone={data.repository.status === "ready" ? "lime" : "amber"}>
                {data.repository.status}
              </Pill>
              <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                <GitBranch className="h-3 w-3" /> {data.repository.branch}
              </span>
            </div>
            <p className="truncate font-mono text-[10.5px] text-slate-400">
              {data.repository.githubUrl}
              {data.repository.lastAnalyzedAt && (
                <span className="ml-2 text-slate-500">· analyzed {timeAgo(data.repository.lastAnalyzedAt)}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/dashboard/impact"
            className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/5"
          >
            <Network className="h-3.5 w-3.5 text-lime-300" /> Impact Explorer
          </Link>
          <button
            onClick={reanalyze}
            disabled={analyzing}
            className="flex items-center gap-1.5 rounded-md bg-lime-300 px-3 py-1.5 text-xs font-bold text-[#0a0f0a] hover:bg-lime-200 disabled:opacity-60"
          >
            {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {analyzing ? "Analyzing…" : "Re-analyze"}
          </button>
        </div>
      </div>

      {/* Compact Stat Tiles Row */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <div className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#0c1017] p-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Health</span>
            <p className="text-xl font-bold font-mono text-lime-300">{s.health}%</p>
          </div>
          <HealthRing score={s.health} size={50} />
        </div>
        <StatBox label="Files" value={s.files} sub={`${data.files.reduce((a, b) => a + (b.loc || 0), 0)} lines`} tone="blue" />
        <StatBox label="Entities" value={s.entities} sub={`${s.byType["Function"] ?? 0} fns · ${s.byType["Class"] ?? 0} classes`} tone="lime" />
        <StatBox label="Graph Edges" value={s.relationships} sub="dependencies" tone="violet" />
        <StatBox label="Open Risks" value={s.openFindings} sub={`${s.bySeverity["high"] ?? 0} high`} tone={s.bySeverity["high"] ? "rose" : "default"} />
        <StatBox label="Cleanup Tasks" value={s.pendingCleanup} sub="candidates" tone={s.pendingCleanup > 0 ? "amber" : "default"} />
      </div>

      {/* 3 Compact Feature Panes */}
      <div className="grid gap-2.5 md:grid-cols-3">
        <div className="flex flex-col justify-between rounded-lg border border-white/[0.08] bg-[#0c1017] p-3.5">
          <div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                <Network className="h-4 w-4 text-lime-300" /> Change Impact
              </span>
              <Pill tone="lime">{s.byType["API"] ?? 0} APIs</Pill>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
              Traverse the code graph from any symbol. See direct & transitive blast radius across repos.
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2">
            <span className="text-[11px] text-slate-400">
              {s.byType["Component"] ?? 0} comps · {s.byType["Test"] ?? 0} tests
            </span>
            <Link href="/dashboard/impact" className="flex items-center gap-1 text-[11.5px] font-bold text-lime-300 hover:underline">
              Analyze <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-lg border border-white/[0.08] bg-[#0c1017] p-3.5">
          <div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                <ShieldCheck className="h-4 w-4 text-[#79b8ff]" /> Before You Commit
              </span>
              <Pill tone={s.bySeverity["high"] ? "rose" : "lime"}>
                {s.openFindings} risks
              </Pill>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
              8 deterministic rules check rename fallouts, missing auth, sensitive leaks, and broken contracts.
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2">
            <div className="flex items-center gap-1.5 text-[10.5px]">
              <span className="text-rose-300 font-bold">{s.bySeverity["high"] ?? 0} High</span> ·
              <span className="text-amber-300 font-bold">{s.bySeverity["medium"] ?? 0} Med</span> ·
              <span className="text-lime-300 font-bold">{s.bySeverity["passed"] ?? 0} Passed</span>
            </div>
            <Link href="/dashboard/safety" className="flex items-center gap-1 text-[11.5px] font-bold text-[#79b8ff] hover:underline">
              Safety report <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-lg border border-white/[0.08] bg-[#0c1017] p-3.5">
          <div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                <Wand2 className="h-4 w-4 text-violet-300" /> Code Janitor
              </span>
              <Pill tone="amber">{s.pendingCleanup} pending</Pill>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
              Detect dead functions, unused imports & stale dependencies with one-click diff previews.
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2">
            <span className="text-[11px] text-slate-400 truncate">
              {Object.entries(s.byCleanup).slice(0, 2).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(" · ") || "Clean"}
            </span>
            <Link href="/dashboard/janitor" className="flex items-center gap-1 text-[11.5px] font-bold text-violet-300 hover:underline">
              Clean up <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main 2-Column Split: Findings & Cleanups */}
      <div className="grid gap-3 lg:grid-cols-5">
        {/* Recent Safety Findings */}
        <div className="lg:col-span-3 rounded-lg border border-white/[0.08] bg-[#0c1017] p-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <span className="text-xs font-bold text-slate-200">Safety Findings</span>
            <Link href="/dashboard/safety" className="text-[11px] font-semibold text-lime-300 hover:underline">
              View all ({data.recentFindings.length})
            </Link>
          </div>
          <div className="mt-2 space-y-1.5">
            {data.recentFindings.slice(0, 5).map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-md border border-white/[0.05] bg-white/[0.015] px-2.5 py-1.5 hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <SeverityPill severity={f.severity} />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-200">{f.title}</p>
                    <p className="truncate font-mono text-[10.5px] text-slate-400">{f.filePath}</p>
                  </div>
                </div>
                <span className="shrink-0 text-[10px] text-slate-400 font-mono">{timeAgo(f.createdAt)}</span>
              </div>
            ))}
            {data.recentFindings.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-500">No findings open: repository looks clean!</p>
            )}
          </div>
        </div>

        {/* Indexed files & changes */}
        <div className="lg:col-span-2 rounded-lg border border-white/[0.08] bg-[#0c1017] p-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <span className="text-xs font-bold text-slate-200">Indexed Files ({data.files.length})</span>
            <span className="text-[11px] text-slate-400 font-mono">AST parsed</span>
          </div>
          <div className="mt-2 max-h-[160px] space-y-1 overflow-y-auto scroll-thin pr-1">
            {data.files.map((f) => (
              <div key={f.path} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-white/[0.03]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${f.language === "python" ? "bg-amber-400" : f.language === "typescript" ? "bg-[#58a6ff]" : "bg-slate-500"}`} />
                  <span className="truncate font-mono text-[11px] text-slate-300">{f.path}</span>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-slate-400">{f.loc}L</span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 border-t border-white/[0.06] pt-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Recent Change Queries</span>
            <div className="mt-1 space-y-1">
              {data.changes.slice(0, 3).map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="rounded bg-lime-400/10 px-1.5 py-0.5 font-mono text-[10px] text-lime-300 font-semibold">{c.changeType}</span>
                  <span className="truncate font-mono text-[11px] text-slate-300">{c.symbol}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
