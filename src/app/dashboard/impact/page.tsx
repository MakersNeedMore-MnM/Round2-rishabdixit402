"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Network,
  Play,
  Loader2,
  History,
  ArrowRight,
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Lightbulb,
  RotateCcw,
  FileCode2,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import { useActiveRepo } from "@/components/shell";
import { TabButton, EmptyState, LoadingDots, Modal } from "@/components/ui";
import { cx } from "@/lib/utils";

interface Suggestion {
  name: string;
  qualifiedName: string;
  type: string;
  filePath: string;
}

interface ImpactNode {
  name: string;
  file: string;
  type: string;
  depth: number;
  confidence: string;
  via: string;
}

interface ImpactResult {
  symbol: string;
  nodes: ImpactNode[];
  files: string[];
  apis: string[];
  components: string[];
  tests: string[];
  summary: { files: number; apis: number; components: number; tests: number; functions?: number };
}

const TYPE_COLOR: Record<string, string> = {
  API: "text-sky-300",
  Component: "text-purple-300",
  Function: "text-lime-300",
  Class: "text-amber-300",
  Test: "text-teal-300",
  Field: "text-rose-300",
};

function typeColor(type: string): string {
  return TYPE_COLOR[type] ?? "text-slate-300";
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "text-lime-300/90",
  medium: "text-amber-300/90",
  low: "text-rose-300/90",
};

function generateAiPrompt(
  result: ImpactResult,
  symbol: string,
  newValue?: string,
  mode: "fix" | "assess" = "fix"
): string {
  const targetNode = result.nodes.find((n) => n.depth === 0);
  const directNodes = result.nodes.filter((n) => n.depth === 1);
  const transitiveNodes = result.nodes.filter((n) => n.depth > 1);
  const targetFile = targetNode?.file || (result.files && result.files[0]) || "target definition file";
  const newSym = newValue?.trim();

  if (mode === "assess") {
    return `# 🛡️ Blast Radius & Architectural Risk Assessment: \`${symbol}\`

You are a senior software architect and code safety engineer. I am evaluating a refactor/modification to \`${symbol}\` in this repository.

## 🎯 Target Specification
- **Symbol**: \`${symbol}\`
${newSym ? `- **Proposed Replacement**: \`${newSym}\`\n` : ""}- **Primary Definition**: \`${targetFile}\`

---

## 📊 AST-Verified Blast Radius
- **Affected Files**: ${result.files?.length || 0}
- **Impacted API Routes**: ${result.apis?.length || 0} (${result.apis?.length ? result.apis.join(", ") : "None"})
- **Impacted UI Components**: ${result.components?.length || 0} (${result.components?.length ? result.components.join(", ") : "None"})
- **Impacted Test Suites**: ${result.tests?.length || 0} (${result.tests?.length ? result.tests.join(", ") : "None"})
- **Direct Call Sites (Hop 1)**: ${directNodes.length} symbols
- **Transitive Call Sites (Hop > 1)**: ${transitiveNodes.length} symbols

---

## ⚠️ Potential Breakages & Downstream Hazards
1. **Direct Call Failures**: Any caller not updated will fail at runtime (\`AttributeError\`, \`TypeError\`, or missing export).
2. **Silent Contract Break**: Downstream endpoints relying on \`${symbol}\` may emit altered JSON payloads, breaking clients without compiler warnings.
3. **Frontend Invalidation**: UI components referencing \`${symbol}\` will evaluate to \`undefined\`, producing blank views or broken states.
4. **Test Failures**: ${(result.tests || []).length} test suites directly verify this symbol or its immediate dependencies.

---

## 📂 Impacted Entities & Relationships
${result.nodes.slice(0, 30).map((n) => `- **\`${n.name}\`** (${n.type}) in \`${n.file}\` [${n.depth === 0 ? "Target" : n.depth === 1 ? "Direct caller" : `Hop ${n.depth}`}, via ${n.via}, confidence: ${n.confidence}]`).join("\n")}
${result.nodes.length > 30 ? `\n_...and ${result.nodes.length - 30} more symbols across the repository._\n` : ""}

---

## 📋 Required Output From AI
Please review the evidence above and output:
1. Critical edge-cases or runtime failure modes across the affected files.
2. Step-by-step phased migration plan (e.g. deprecation shim, dual-read database phase).
3. Exact verification checklist to guarantee zero regressions.`;
  }

  // mode === "fix" (Remediation / Coordinated Refactoring)
  return `# 🚀 Coordinated Blast-Radius Refactoring Task: \`${symbol}\`

You are an autonomous AI software engineer. Execute a coordinated multi-file refactoring for \`${symbol}\`${newSym ? ` to \`${newSym}\`` : ""} across this repository.

> **CRITICAL**: Do NOT just edit the definition. The AST dependency graph has identified **${result.files?.length || 0} files** and **${result.nodes.length} call sites** that will break if not updated together. Follow the blast radius blueprint below.

---

## 1. Change Specification
- **Symbol to Refactor**: \`${symbol}\`
${newSym ? `- **New Name / Contract**: \`${newSym}\`\n` : `- **Goal**: Update definition and all call sites cleanly without broken references.\n`}- **Originating File**: \`${targetFile}\`

---

## 2. Exact Blast Radius Blueprint (Must Be Updated Together)

### 🔴 Direct Callers (Update First - Hop 1)
${directNodes.length > 0 
  ? directNodes.map(n => `- \`${n.name}\` (${n.type}) in \`${n.file}\` — Calls via \`${n.via}\``).join("\n") 
  : "- No direct callers detected."}

### 🌐 Impacted APIs & Controllers
${(result.apis || []).length > 0 
  ? (result.apis || []).map(a => `- API Route / Handler: \`${a}\``).join("\n") 
  : "- No public API endpoints detected in blast radius."}

### 🖥️ Impacted Frontend UI Components
${(result.components || []).length > 0 
  ? (result.components || []).map(c => `- Component: \`${c}\``).join("\n") 
  : "- No frontend components directly affected."}

### 🧪 Test Suites to Update & Verify
${(result.tests || []).length > 0 
  ? (result.tests || []).map(t => `- Test File: \`${t}\``).join("\n") 
  : "- Run the project's main test suite."}

---

## 3. Step-by-Step AI Execution Instructions
1. **Update Definition**:
   - In \`${targetFile}\`, update \`${symbol}\`${newSym ? ` to \`${newSym}\`` : ""}. Update exports, types, or docstrings.
2. **Update Direct Call Sites**:
   - Navigate to each direct caller in Section 2 above and update references to match the new definition.
3. **Verify API Contract Stability**:
   - Check serializers/controllers in ${(result.apis || []).slice(0, 3).join(", ") || "API endpoints"}. Ensure external clients or JSON schemas are not unexpectedly broken.
4. **Update Frontend UI**:
   - Check component data bindings in ${(result.components || []).slice(0, 3).join(", ") || "UI files"} so runtime rendering succeeds with no \`undefined\` access errors.
5. **Update and Run Test Suites**:
   - Update assertions and fixtures in ${(result.tests || []).slice(0, 3).join(", ") || "test files"}. Run tests to verify zero regressions.

---

## 4. Guardrails & Strict Constraints
- Do NOT leave stale references to \`${symbol}\` in any of the affected files.
- Do NOT make unnecessary changes to unrelated files outside this blast radius.
- Ensure the codebase builds cleanly and all imports resolve with zero errors.`;
}

export default function ImpactPage() {
  const repoId = useActiveRepo();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [symbol, setSymbol] = useState("");
  const [newValue, setNewValue] = useState("");
  const [result, setResult] = useState<ImpactResult | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<Array<{ symbol: string; createdAt: string }>>([]);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "warning" | "error" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptMode, setPromptMode] = useState<"fix" | "assess">("fix");
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-dismiss status popup after 4 seconds
  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const run = useCallback(
    async (sym?: string) => {
      const target = (sym ?? symbol).trim();
      if (!target) {
        setError("Enter a function, component, or symbol name to analyze.");
        return;
      }

      setError(null);
      setStatusMessage(null);
      setRunning(true);
      setShowDropdown(false);

      // Auto-resolve repoId if empty
      let currentRepo = repoId;
      if (!currentRepo) {
        try {
          const rRes = await fetch("/api/repositories");
          if (rRes.ok) {
            const rData = await rRes.json();
            const pick = rData.repositories?.find((r: any) => r.isDemo) ?? rData.repositories?.[0];
            if (pick) {
              currentRepo = pick.id;
              localStorage.setItem("regit_repo", pick.id);
            }
          }
        } catch {
          // ignore
        }
      }

      if (!currentRepo) {
        setError("No active repository found. Connect or select a repository first.");
        setRunning(false);
        return;
      }

      try {
        const res = await fetch(`/api/repositories/${currentRepo}/impact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: target, newValue: newValue.trim() || undefined }),
        });

        if (res.ok) {
          const json = await res.json();
          setResult(json);
          const count = (json.nodes || []).length;
          const fileCount = (json.files || []).length;
          if (count > 0) {
            setStatusType("success");
            setStatusMessage(`${count} affected symbols across ${fileCount} files.`);
          } else {
            setStatusType("warning");
            setStatusMessage(`No direct callers found for "${target}".`);
          }
          setHistory((h) => [{ symbol: target, createdAt: new Date().toISOString() }, ...h].slice(0, 8));
        } else {
          const errData = await res.json().catch(() => ({}));
          setError(errData.error || "Impact analysis failed. Please try again.");
        }
      } catch {
        setError("Network error. Unable to reach the backend.");
      } finally {
        setRunning(false);
      }
    },
    [symbol, newValue, repoId]
  );

  // Mount/repo-switch effect: intentionally runs once per repoId. The run()
  // dependency is deliberately omitted (stable per symbol input) and state is
  // set inside promise callbacks rather than the effect body.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!repoId) return;
    setResult(null); // Reset when repo switches
    fetch(`/api/repositories/${repoId}/impact`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.suggestions && j.suggestions.length > 0) {
          setSuggestions(j.suggestions);
          const topSymbol = j.suggestions[0].name;
          setSymbol(topSymbol);
          setNewValue(`${topSymbol}_updated`);
          run(topSymbol);
        }
      })
      .catch(() => null);

    fetch(`/api/repositories/${repoId}/changes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.changes) setHistory(j.changes.slice(0, 8));
      })
      .catch(() => null);
  }, [repoId]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // Autocomplete matching list
  const filteredSuggestions = useMemo(() => {
    const q = symbol.trim().toLowerCase();
    return suggestions.filter((s) => {
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.filePath.toLowerCase().includes(q);
    });
  }, [suggestions, symbol]);

  const quickPills = useMemo(() => {
    if (suggestions && suggestions.length > 0) {
      return suggestions.slice(0, 7).map((s) => ({ name: s.name, type: s.type }));
    }
    return [];
  }, [suggestions]);

  const allNodes = useMemo(() => result?.nodes || [], [result]);
  const directNodes = useMemo(() => allNodes.filter((n) => n.depth === 1), [allNodes]);
  const transitiveNodes = useMemo(() => allNodes.filter((n) => n.depth > 1), [allNodes]);
  const apiNodes = useMemo(() => allNodes.filter((n) => n.type === "API"), [allNodes]);
  const componentNodes = useMemo(() => allNodes.filter((n) => n.type === "Component"), [allNodes]);
  const testNodes = useMemo(() => allNodes.filter((n) => n.type === "Test"), [allNodes]);

  const filteredList = useMemo(() => {
    return allNodes.filter((node) => {
      // Filter by category
      if (activeFilter === "direct" && node.depth !== 1) return false;
      if (activeFilter === "transitive" && node.depth <= 1) return false;
      if (activeFilter === "api" && node.type !== "API") return false;
      if (activeFilter === "component" && node.type !== "Component") return false;
      if (activeFilter === "test" && node.type !== "Test") return false;

      // Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = node.name.toLowerCase().includes(q);
        const matchFile = node.file.toLowerCase().includes(q);
        const matchType = node.type.toLowerCase().includes(q);
        if (!matchName && !matchFile && !matchType) return false;
      }

      return true;
    });
  }, [allNodes, activeFilter, searchQuery]);

  const handleCopyPrompt = useCallback(
    (mode: "fix" | "assess" = promptMode) => {
      if (!result) return;
      const text = generateAiPrompt(result, symbol, newValue, mode);
      navigator.clipboard.writeText(text);
      setCopiedPrompt(true);
      setStatusType("success");
      setStatusMessage("AI prompt copied to clipboard! Ready to paste into Cursor / Claude.");
      setTimeout(() => setCopiedPrompt(false), 2500);
    },
    [result, symbol, newValue, promptMode]
  );

  const generatedPrompt = useMemo(() => {
    if (!result) return "";
    return generateAiPrompt(result, symbol, newValue, promptMode);
  }, [result, symbol, newValue, promptMode]);

  return (
    <div className="space-y-3">
      {/* Slim header: title left, history + summary right */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[13px] font-bold text-slate-200">Impact</h1>
          {result && (
            <span className="font-mono text-[11px] text-slate-500">
              {result.symbol}
              {newValue && (
                <span className="inline-flex items-center gap-1">
                  <ArrowRight className="inline h-2.5 w-2.5" /> {newValue}
                </span>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {result && (
            <>
              <button
                type="button"
                onClick={() => handleCopyPrompt("fix")}
                className="inline-flex items-center gap-1.5 rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1 font-mono text-[11px] font-bold text-lime-300 transition-all hover:bg-lime-400/20 active:scale-95"
                title="Copy ready-to-use prompt for Cursor/Claude"
              >
                {copiedPrompt ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                <span>{copiedPrompt ? "Copied!" : "Copy AI Prompt"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPromptModal(true)}
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-lime-300"
                title="View full AI prompt with blast radius"
              >
                <Sparkles className="h-3.5 w-3.5 text-lime-300" />
              </button>
              <button
                type="button"
                onClick={() => setShowSummaryModal(true)}
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-lime-300"
                title="Plain-English change summary"
              >
                <Lightbulb className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-100"
            title="Recent queries"
          >
            <History className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Command bar: symbol + new value + run, one quiet line */}
      <div className="relative flex flex-wrap items-center gap-2" ref={dropdownRef}>
        <div className="relative min-w-0 flex-1 sm:min-w-[260px]">
          <input
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setShowDropdown(false);
                run();
              }
            }}
            placeholder="Target symbol — e.g. User.email"
            className="pill-input w-full rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-500"
          />
          {symbol && (
            <button
              type="button"
              onClick={() => {
                setSymbol("");
                setShowDropdown(true);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-500 hover:text-slate-200"
              title="Clear"
            >
              ✕
            </button>
          )}
        </div>

        <div className="relative hidden min-w-0 flex-1 sm:block sm:min-w-[200px]">
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="New name (optional)"
            className="pill-input w-full rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-500"
          />
        </div>

        <button
          type="button"
          onClick={() => run()}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-full bg-lime-300 px-4 py-2 text-xs font-bold text-[#0a0f0a] transition-colors hover:bg-lime-200 disabled:opacity-60"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
          {running ? "Analyzing…" : "Analyze"}
        </button>

        {/* Symbol autocomplete */}
        {showDropdown && filteredSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-white/[0.1] bg-[#0c1017] p-1 shadow-2xl backdrop-blur-md scroll-thin">
            {filteredSuggestions.slice(0, 12).map((s) => (
              <button
                key={s.qualifiedName + s.name}
                type="button"
                onClick={() => {
                  setSymbol(s.name);
                  setShowDropdown(false);
                  run(s.name);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/[0.05]"
              >
                <span className={cx("font-mono text-[10px] font-bold uppercase", typeColor(s.type))}>
                  {s.type.slice(0, 3)}
                </span>
                <span className="truncate font-mono font-semibold text-slate-100">{s.name}</span>
                <span className="truncate font-mono text-[10.5px] text-slate-500">{s.filePath}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick symbols: quiet mono chips */}
      {quickPills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {quickPills.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => {
                setSymbol(s.name);
                run(s.name);
              }}
              disabled={running}
              className={cx(
                "rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors disabled:opacity-60",
                symbol === s.name
                  ? "bg-lime-300/15 font-semibold text-lime-200"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Floating loading pill */}
      {running && (
        <div className="pointer-events-none fixed left-1/2 top-5 z-50 max-w-[90vw] -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-lime-400/30 bg-[#0c1219]/95 px-4 py-1.5 text-xs shadow-2xl backdrop-blur-md">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-lime-300" />
            <span className="text-slate-200">
              Traversing graph for <span className="font-mono font-semibold text-lime-300">{symbol}</span>…
            </span>
          </div>
        </div>
      )}

      {/* Floating status toast */}
      {statusMessage && !running && (
        <div className="fixed left-1/2 top-5 z-50 max-w-[90vw] -translate-x-1/2">
          <div
            className={cx(
              "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs shadow-2xl backdrop-blur-md",
              statusType === "success"
                ? "border-lime-400/30 bg-[#0c1219]/95 text-lime-200"
                : statusType === "warning"
                  ? "border-amber-400/30 bg-[#14120a]/95 text-amber-200"
                  : "border-rose-400/30 bg-[#160a0a]/95 text-rose-200"
            )}
          >
            {statusType === "success" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-lime-300" />}
            {statusType === "warning" && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" />}
            {statusType === "error" && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-300" />}
            <span className="text-slate-200">{statusMessage}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="ml-1 rounded-full p-0.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Error alert */}
      {error && !running && (
        <div className="flex items-center justify-between gap-3 rounded-full border border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
          <span className="flex min-w-0 items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-300" />
            <span className="truncate">{error}</span>
          </span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="rounded-full p-0.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Zero impact notice */}
      {result && result.nodes.length === 0 && !running && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] px-4 py-3 text-xs text-amber-200/90">
          <span className="font-semibold">No callers found for “{result.symbol}”.</span> It may not
          exist in this codebase — try one of the verified symbols:
          <span className="mt-2 flex flex-wrap gap-1.5">
            {quickPills.slice(0, 5).map((qp) => (
              <button
                key={qp.name}
                type="button"
                onClick={() => {
                  setSymbol(qp.name);
                  run(qp.name);
                }}
                className="rounded-full border border-amber-400/25 px-2.5 py-0.5 font-mono text-[11px] text-amber-200 transition-colors hover:bg-amber-400/10"
              >
                {qp.name}
              </button>
            ))}
          </span>
        </div>
      )}

      {running && !result && (
        <div className="flex items-center justify-center rounded-xl border border-white/[0.06] bg-[#0c1017] py-14">
          <LoadingDots label="Identifying direct callers, downstream APIs, and impacted tests…" />
        </div>
      )}

      {result && allNodes.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#0c1017]">
          {/* Results header: stats inline, filters + search below */}
          <div className="border-b border-white/[0.05] px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[12.5px] font-bold text-slate-200">Blast radius</h2>
                <span className="font-mono text-[11px] text-slate-500">
                  {allNodes.length} symbols · {(result.files || []).length} files ·{" "}
                  {(result.apis || []).length} APIs · {(result.components || []).length} UI ·{" "}
                  {(result.tests || []).length} tests
                </span>
              </div>
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter symbols…"
                  className="pill-input w-full rounded-full border border-white/[0.06] bg-white/[0.02] py-1.5 pl-8 pr-3 text-[11.5px] text-slate-200 placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <TabButton active={activeFilter === "all"} onClick={() => setActiveFilter("all")} badge={allNodes.length}>
                All
              </TabButton>
              <TabButton
                active={activeFilter === "direct"}
                onClick={() => setActiveFilter("direct")}
                badge={directNodes.length}
              >
                Direct
              </TabButton>
              <TabButton
                active={activeFilter === "transitive"}
                onClick={() => setActiveFilter("transitive")}
                badge={transitiveNodes.length}
              >
                Transitive
              </TabButton>
              {apiNodes.length > 0 && (
                <TabButton active={activeFilter === "api"} onClick={() => setActiveFilter("api")} badge={apiNodes.length}>
                  APIs
                </TabButton>
              )}
              {componentNodes.length > 0 && (
                <TabButton
                  active={activeFilter === "component"}
                  onClick={() => setActiveFilter("component")}
                  badge={componentNodes.length}
                >
                  UI
                </TabButton>
              )}
              {testNodes.length > 0 && (
                <TabButton
                  active={activeFilter === "test"}
                  onClick={() => setActiveFilter("test")}
                  badge={testNodes.length}
                >
                  Tests
                </TabButton>
              )}
            </div>
          </div>

          {/* AI Remediation Quick-Prompt Banner */}
          <div className="border-b border-white/[0.05] bg-gradient-to-r from-lime-400/[0.06] via-transparent to-sky-400/[0.04] p-3">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-lime-400/30 bg-lime-400/10 text-lime-300 shadow-[0_0_12px_-3px_rgba(190,242,100,0.4)]">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-100">
                      Coordinated AI Fix Prompt Ready
                    </p>
                    <span className="rounded bg-lime-400/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-lime-300">
                      Zero-Hallucination
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Feeds all {(result.files || []).length} affected files & {allNodes.length} callers directly to Cursor, Claude, or Copilot to execute the refactor without breaking downstream contracts.
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyPrompt("fix")}
                  className="inline-flex items-center gap-1.5 rounded-full bg-lime-300 px-3.5 py-1.5 text-xs font-bold text-[#0a0f0a] transition-all hover:bg-lime-200 active:scale-95 shadow-sm"
                >
                  {copiedPrompt ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedPrompt ? "Copied to Clipboard!" : "Copy AI Fix Prompt"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPromptModal(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-slate-100"
                >
                  <span>Preview & Details</span>
                </button>
              </div>
            </div>
          </div>

          {/* Compact result rows */}
          <div className="max-h-[560px] divide-y divide-white/[0.04] overflow-y-auto scroll-thin">
            {filteredList.map((item, idx) => {
              const isTarget = item.depth === 0;
              const isDirect = item.depth === 1;

              return (
                <div
                  key={`${item.name}-${item.file}-${idx}`}
                  className={cx(
                    "group/row flex items-center gap-3 px-3 py-2 transition-colors",
                    isTarget ? "bg-lime-400/[0.04]" : "hover:bg-white/[0.02]"
                  )}
                >
                  {/* Depth dot */}
                  <span
                    title={isTarget ? "Target" : isDirect ? "Direct caller" : `Hop ${item.depth}`}
                    className={cx(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      isTarget ? "bg-lime-300" : isDirect ? "bg-sky-400" : "bg-slate-600"
                    )}
                  />

                  {/* Symbol + file */}
                  <div className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span
                      className={cx(
                        "truncate font-mono text-[12.5px]",
                        isTarget ? "font-bold text-lime-200" : "font-semibold text-slate-100"
                      )}
                    >
                      {item.name}
                    </span>
                    <span className={cx("hidden font-mono text-[10px] font-bold uppercase sm:inline", typeColor(item.type))}>
                      {item.type}
                    </span>
                    <span className="hidden min-w-0 items-center gap-1 font-mono text-[11px] text-slate-500 md:flex">
                      <FileCode2 className="h-3 w-3 shrink-0 text-slate-600" />
                      <span className="truncate">{item.file}</span>
                    </span>
                  </div>

                  {/* Right meta: hop + confidence + via */}
                  <div className="flex shrink-0 items-center gap-2 font-mono text-[10.5px] text-slate-500">
                    <span>{isTarget ? "target" : isDirect ? "hop 1" : `hop ${item.depth}`}</span>
                    <span className={CONFIDENCE_COLOR[item.confidence] ?? "text-slate-500"}>{item.confidence}</span>
                    <span className="hidden max-w-[160px] truncate lg:inline" title={item.via}>
                      via {item.via}
                    </span>
                  </div>
                </div>
              );
            })}

            {filteredList.length === 0 && (
              <p className="py-10 text-center text-xs text-slate-500">
                No symbols match this filter.
              </p>
            )}
          </div>
        </div>
      )}

      {!result && !running && (
        <EmptyState
          icon={<Network className="h-6 w-6" />}
          title="Analyze a symbol"
          hint={
            suggestions.length > 0
              ? `Pick a symbol above (try ${suggestions[0]?.name}) or search one to see its full blast radius before you change it.`
              : "Enter any function, component, or symbol name to see everything it can break."
          }
          action={
            suggestions.length > 0 ? (
              <button
                onClick={() => run(suggestions[0]?.name)}
                className="rounded-full bg-lime-300 px-4 py-1.5 text-xs font-bold text-[#0a0f0a] transition-colors hover:bg-lime-200"
              >
                Analyze {suggestions[0]?.name}
              </button>
            ) : undefined
          }
        />
      )}

      {/* Summary modal */}
      {result && (
        <Modal
          open={showSummaryModal}
          onClose={() => setShowSummaryModal(false)}
          title={
            <span className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-lime-300" />
              Change summary
            </span>
          }
          subtitle={`Renaming ${result.symbol}${newValue ? ` → ${newValue}` : ""}`}
          maxWidth="max-w-xl"
        >
          <div className="space-y-2.5 text-sm">
            <p className="leading-relaxed text-slate-300">
              Changing{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] font-semibold text-lime-200">
                {result.symbol}
              </code>{" "}
              affects <strong className="text-slate-100">{(result.files || []).length} files</strong>,{" "}
              <strong className="text-slate-100">{(result.apis || []).length} APIs</strong>, and{" "}
              <strong className="text-slate-100">{allNodes.length} symbols</strong> across the project.
            </p>

            <div className="space-y-2">
              {[
                {
                  n: 1,
                  tone: "text-lime-300",
                  title: "Direct callers — update first",
                  body:
                    directNodes.length > 0
                      ? `${directNodes.length} symbol(s) call ${result.symbol} directly, e.g. ${directNodes[0]?.name}.`
                      : "No direct callers detected.",
                },
                {
                  n: 2,
                  tone: "text-[#79b8ff]",
                  title: "API contracts — check payloads",
                  body:
                    (result.apis || []).length > 0
                      ? `${(result.apis || []).length} endpoint(s) depend on this symbol: ${(result.apis || []).slice(0, 3).join(", ")}.`
                      : "No public API contracts appear impacted.",
                },
                {
                  n: 3,
                  tone: "text-amber-300",
                  title: "Verify before commit",
                  body:
                    (result.tests || []).length > 0
                      ? `Re-run ${(result.tests || []).length} test suite(s) and clear open findings in Safety.`
                      : "Run the test suite and clear static checks before opening a PR.",
                },
              ].map((step) => (
                <div key={step.n} className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                  <span className={cx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-[11px] font-bold", step.tone)}>
                    {step.n}
                  </span>
                  <div>
                    <p className="text-[12.5px] font-bold text-slate-200">{step.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* AI Remediation Prompt Modal */}
      {result && (
        <Modal
          open={showPromptModal}
          onClose={() => setShowPromptModal(false)}
          title={
            <span className="flex items-center gap-2 text-slate-100">
              <Sparkles className="h-4 w-4 text-lime-300" />
              AI Remediation & Refactoring Prompt
            </span>
          }
          subtitle={`Pre-computed AST context for ${result.symbol} — paste into Cursor, Claude, Copilot or ChatGPT`}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-3">
            {/* Top Bar: Prompt Mode Tabs & Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPromptMode("fix")}
                  className={cx(
                    "rounded-full px-3 py-1 text-xs font-bold transition-all",
                    promptMode === "fix"
                      ? "bg-lime-400/15 text-lime-300 border border-lime-400/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                  )}
                >
                  🚀 Multi-File Fix Prompt
                </button>
                <button
                  type="button"
                  onClick={() => setPromptMode("assess")}
                  className={cx(
                    "rounded-full px-3 py-1 text-xs font-bold transition-all",
                    promptMode === "assess"
                      ? "bg-sky-400/15 text-sky-300 border border-sky-400/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                  )}
                >
                  🛡️ Architectural Risk Assessment
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleCopyPrompt(promptMode)}
                className="inline-flex items-center gap-1.5 rounded-full bg-lime-300 px-3.5 py-1.5 text-xs font-bold text-[#0a0f0a] transition-all hover:bg-lime-200 active:scale-95 shadow-sm"
              >
                {copiedPrompt ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedPrompt ? "Copied to Clipboard!" : "Copy Prompt"}</span>
              </button>
            </div>

            {/* Why This Works (Educational Callout) */}
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 text-[11.5px] text-slate-300 leading-relaxed">
              <span className="font-semibold text-lime-300">💡 Why give this to your AI Agent?</span> Normal AI agents (Cursor, Claude, Copilot) only see 1–2 open files and miss breaking changes across the rest of the repo. This prompt feeds them the <strong>complete AST call graph</strong> with all {(result.files || []).length} affected files and downstream contracts so they can execute the entire refactor with zero hallucinations.
            </div>

            {/* Prompt Code Block Container */}
            <div className="relative rounded-lg border border-white/[0.1] bg-[#070b12] p-3.5">
              <div className="absolute right-3 top-3 flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
                <span>markdown</span>
                <span>•</span>
                <span>{generatedPrompt.split("\n").length} lines</span>
              </div>
              <pre className="max-h-[380px] overflow-y-auto whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-slate-200 scroll-thin select-all">
                {generatedPrompt}
              </pre>
            </div>

            {/* Footer tips */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-[11px] text-slate-500">
              <span>Optimized for Cursor Composer, Claude Code, GitHub Copilot & ChatGPT.</span>
              <button
                type="button"
                onClick={() => handleCopyPrompt(promptMode)}
                className="text-lime-300 hover:underline flex items-center gap-1"
              >
                <Copy className="h-3 w-3" />
                <span>Quick Copy</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* History modal */}
      <Modal
        open={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="Recent queries"
        subtitle={`${history.length} run${history.length === 1 ? "" : "s"} on this repository`}
        maxWidth="max-w-md"
      >
        <div className="space-y-1">
          {history.map((h, i) => (
            <button
              key={i}
              onClick={() => {
                setShowHistoryModal(false);
                setSymbol(h.symbol);
                run(h.symbol);
              }}
              className="flex w-full items-center justify-between rounded-full border border-white/[0.05] bg-white/[0.02] px-3.5 py-1.5 text-left font-mono text-xs text-slate-200 transition-colors hover:border-lime-400/30 hover:bg-white/[0.05]"
            >
              <span className="flex items-center gap-2 truncate">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime-300/70" />
                <span className="truncate">{h.symbol}</span>
              </span>
              <span className="ml-2 shrink-0 text-[11px] text-slate-500">re-run</span>
            </button>
          ))}
          {history.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No queries yet.</p>}

          <p className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3 text-[11.5px] leading-relaxed text-amber-200/80">
            Dynamically-resolved references are tagged <b>low confidence</b> instead of being omitted,
            so nothing hides from review.
          </p>
        </div>
      </Modal>
    </div>
  );
}
