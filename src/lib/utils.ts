export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function timeAgo(d?: string | Date | null): string {
  if (!d) return "recently";
  const date = typeof d === "string" ? new Date(d) : d;
  if (!date || isNaN(date.getTime())) return "recently";
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${Math.max(1, s)}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function shortSha(): string {
  return Math.random().toString(16).slice(2, 9);
}

export function severityColor(sev: string): string {
  switch (sev) {
    case "high":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
    case "medium":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "low":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "passed":
      return "bg-lime-500/15 text-lime-300 border-lime-500/30";
    default:
      return "bg-slate-500/15 text-slate-300 border-slate-500/30";
  }
}

export function confidenceColor(c: string): string {
  switch (c) {
    case "high":
      return "bg-lime-400/15 text-lime-300 border-lime-400/30";
    case "medium":
      return "bg-sky-400/15 text-sky-300 border-sky-400/30";
    default:
      return "bg-amber-400/15 text-amber-300 border-amber-400/30";
  }
}

export function typeIcon(type: string): string {
  const map: Record<string, string> = {
    File: "◉",
    Function: "ƒ",
    Class: "◈",
    API: "⬡",
    Component: "⬢",
    Test: "✔",
    Dependency: "⬣",
    Field: "●",
    Import: "↗",
  };
  return map[type] ?? "●";
}
