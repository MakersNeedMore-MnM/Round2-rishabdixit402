"use client";

import { cx, severityColor, confidenceColor } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function Pill({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "lime" | "blue" | "rose" | "amber";
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "bg-white/[0.04] text-slate-300 border-white/[0.08]",
    lime: "bg-lime-400/10 text-lime-300 border-lime-400/20",
    blue: "bg-sky-400/10 text-sky-300/90 border-sky-400/20",
    rose: "bg-rose-500/10 text-rose-300 border-rose-500/20",
    amber: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-none tracking-tight",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function BubbleCard({
  children,
  className,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-lg border border-white/[0.08] bg-[#0c1017] p-3 sm:p-3.5 shadow-xs",
        hover && "transition-all hover:border-white/20 hover:bg-[#0f1520]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function TabButton({
  active,
  onClick,
  children,
  badge,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  badge?: number | string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-lime-400/10 text-lime-300 border border-lime-400/25 shadow-[0_0_12px_-4px_rgba(190,242,100,0.2)]"
          : "border border-white/[0.06] bg-white/[0.02] text-slate-400 hover:text-slate-200 hover:border-white/[0.12] hover:bg-white/[0.04]",
        className
      )}
    >
      {children}
      {badge !== undefined && (
        <span
          className={cx(
            "rounded px-1 text-[10px] font-bold font-mono",
            active ? "bg-lime-400/15 text-lime-200" : "bg-white/[0.06] text-slate-400"
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export function StatBox({
  label,
  value,
  sub,
  tone = "default",
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "lime" | "blue" | "rose" | "amber" | "violet";
  className?: string;
}) {
  const accent: Record<string, string> = {
    default: "text-slate-100",
    lime: "text-lime-300",
    blue: "text-slate-100",
    rose: "text-rose-400",
    amber: "text-amber-300",
    violet: "text-slate-100",
  };

  return (
    <div className={cx("flex flex-col rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 sm:p-3.5 transition-colors", className)}>
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className={cx("text-2xl font-bold tracking-tight font-mono", accent[tone])}>{value}</span>
        {sub && <span className="text-xs text-slate-400 truncate">{sub}</span>}
      </div>
    </div>
  );
}

export function CircleStat({
  value,
  label,
  tone = "lime",
  size = 64,
}: {
  value: string | number;
  label: string;
  tone?: "lime" | "blue" | "rose" | "amber" | "violet";
  size?: number;
}) {
  const ring: Record<string, string> = {
    lime: "from-lime-300/70 to-transparent",
    blue: "from-[#58a6ff]/80 to-transparent",
    rose: "from-rose-400/80 to-transparent",
    amber: "from-amber-300/80 to-transparent",
    violet: "from-violet-400/80 to-transparent",
  };
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cx("rounded-full bg-gradient-to-b p-[1.5px]", ring[tone])}
        style={{ width: size, height: size }}
      >
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#080d15]">
          <span className="text-base font-bold leading-none tracking-tight font-mono">{value}</span>
        </div>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
    </div>
  );
}

/**
 * Larger landing-page stat medallion: conic gradient ring + dashed orbit +
 * centered value. Pure circles, premium finish.
 */
export function RingStat({
  value,
  label,
  tone = "lime",
  size = 108,
}: {
  value: string;
  label: string;
  tone?: "lime" | "blue" | "rose" | "amber" | "violet";
  size?: number;
}) {
  const text: Record<string, string> = {
    lime: "text-lime-300",
    blue: "text-[#79b8ff]",
    rose: "text-rose-300",
    amber: "text-amber-300",
    violet: "text-violet-300",
  };
  const dot: Record<string, string> = {
    lime: "bg-lime-300",
    blue: "bg-[#58a6ff]",
    rose: "bg-rose-400",
    amber: "bg-amber-300",
    violet: "bg-violet-400",
  };
  return (
    <div
      className="relative rounded-full ring-conic-soft p-[1.5px] shadow-[0_0_40px_-12px_rgba(190,242,100,.35)]"
      style={{ width: size, height: size }}
    >
      <div className="h-full w-full rounded-full bg-[#080d15]" />
      {/* dashed orbit + satellite dot, spins slowly */}
      <div className="orbit-ring animate-orbit pointer-events-none absolute inset-[7px] z-0">
        <span
          className={cx("absolute -top-[3px] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full", dot[tone])}
        />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={cx("font-mono text-xl font-extrabold leading-none tracking-tight", text[tone])}>
          {value}
        </span>
        <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      </div>
    </div>
  );
}

/**
 * Feature medallion: a perfectly round glass disc with a hexagon icon well.
 * Optional `orbit` renders the small satellite dots around the edge.
 */
export function FeatureOrb({
  icon,
  tone = "lime",
  size = 128,
  badge,
}: {
  icon: ReactNode;
  tone?: "lime" | "blue" | "violet";
  size?: number;
  badge?: string;
}) {
  const glow: Record<string, string> = {
    lime: "shadow-[0_0_60px_-18px_rgba(190,242,100,.5)]",
    blue: "shadow-[0_0_60px_-18px_rgba(88,166,255,.55)]",
    violet: "shadow-[0_0_60px_-18px_rgba(167,139,250,.5)]",
  };
  const hexBg: Record<string, string> = {
    lime: "bg-lime-300/10 text-lime-300",
    blue: "bg-[#58a6ff]/10 text-[#9ecbff]",
    violet: "bg-violet-400/10 text-violet-300",
  };
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className={cx(
          "circle-panel ring-conic-soft flex items-center justify-center border p-[1.5px]",
          glow[tone]
        )}
        style={{ width: size, height: size }}
      >
        <div className="flex h-full w-full items-center justify-center rounded-full bg-[#080d15]/95">
          <div className={cx("hex flex items-center justify-center", hexBg[tone])} style={{ width: size * 0.44, height: size * 0.44 }}>
            {icon}
          </div>
        </div>
      </div>
      {badge && (
        <span
          className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-[#0b111c] px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-200"
        >
          {badge}
        </span>
      )}
    </div>
  );
}

export function SeverityPill({ severity }: { severity: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        severityColor(severity)
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {severity}
    </span>
  );
}

export function ConfidencePill({ confidence }: { confidence: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-tight",
        confidenceColor(confidence)
      )}
    >
      {confidence} confidence
    </span>
  );
}

export function LoadingDots({ label = "Analyzing" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-lime-300" />
      <span>{label}</span>
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1 w-1 animate-pulse rounded-full bg-lime-300" style={{ animationDelay: `${i * 200}ms` }} />
        ))}
      </span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("shimmer rounded-md", className ?? "h-4 w-32")} />;
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-5 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300">
        {icon}
      </div>
      <p className="text-[13px] font-semibold text-slate-200">{title}</p>
      <p className="max-w-xs text-[11.5px] leading-relaxed text-slate-400">{hint}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ReGitIcon({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cx("shrink-0 transition-all duration-300 group-hover:scale-105", className)}
    >
      <defs>
        {/* Core dynamic neon gradient */}
        <linearGradient id="regit-neon-grad" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#bef264" />
          <stop offset="50%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>

        {/* Glow border gradient */}
        <linearGradient id="regit-border-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#bef264" stopOpacity="0.65" />
          <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.45" />
        </linearGradient>

        {/* Ambient radial glow */}
        <radialGradient id="regit-core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#bef264" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#bef264" stopOpacity="0" />
        </radialGradient>

        {/* Shadow filter for nodes and paths */}
        <filter id="regit-neon-glow" x="-10%" y="-10%" width="120%" height="120%" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#bef264" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Futuristic Shield/Hex Badge Container */}
      <rect
        x="2"
        y="2"
        width="36"
        height="36"
        rx="10"
        fill="#070c16"
        stroke="url(#regit-border-grad)"
        strokeWidth="1.5"
      />

      {/* Internal ambient radial glow */}
      <circle cx="20" cy="20" r="14" fill="url(#regit-core-glow)" />

      {/* Glowing ReGit "R" Branch Paths */}
      <g filter="url(#regit-neon-glow)">
        {/* Main Git Commit Trunk (Vertical Line) */}
        <path
          d="M13.5 11V29"
          stroke="url(#regit-neon-grad)"
          strokeWidth="2.75"
          strokeLinecap="round"
        />

        {/* Loop of the R (Branch merge arc) */}
        <path
          d="M13.5 11.5H21C24.3137 11.5 27 13.9624 27 17C27 20.0376 24.3137 22.5 21 22.5H13.5"
          stroke="url(#regit-neon-grad)"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Diagonal Blast-Radius Feature Branch (Leg of R) */}
        <path
          d="M20 21.5L26.5 29"
          stroke="url(#regit-neon-grad)"
          strokeWidth="2.75"
          strokeLinecap="round"
        />

        {/* Git Nodes (Commits on the graph) */}
        {/* Node 1: Root commit (top-left) */}
        <circle cx="13.5" cy="11.5" r="2.75" fill="#070c16" stroke="#bef264" strokeWidth="2" />
        <circle cx="13.5" cy="11.5" r="1" fill="#bef264" />

        {/* Node 2: Trunk commit (bottom-left) */}
        <circle cx="13.5" cy="29" r="2.75" fill="#070c16" stroke="#38bdf8" strokeWidth="2" />
        <circle cx="13.5" cy="29" r="1" fill="#38bdf8" />

        {/* Node 3: Merge/Loop commit */}
        <circle cx="27" cy="17" r="2.2" fill="#bef264" />

        {/* Node 4: Active Feature Branch tip */}
        <circle cx="26.5" cy="29" r="3" fill="#070c16" stroke="#bef264" strokeWidth="2" />
        <circle cx="26.5" cy="29" r="1.2" fill="#bef264" />
      </g>
    </svg>
  );
}

export function Logo({
  size = 32,
  showBadge = true,
  className = "",
}: {
  size?: number;
  showBadge?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("group flex items-center gap-2.5 select-none", className)}>
      <ReGitIcon size={size} />
      <div className="flex flex-col justify-center leading-none">
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-extrabold tracking-tight text-white group-hover:text-slate-100 transition-colors">
            Re<span className="bg-gradient-to-r from-lime-300 via-emerald-400 to-[#58a6ff] bg-clip-text text-transparent">Git</span>
          </span>
          {showBadge && (
            <span className="rounded-[4px] border border-lime-400/30 bg-lime-400/10 px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider text-lime-300 shadow-[0_0_12px_rgba(190,242,100,0.15)]">
              AI
            </span>
          )}
        </div>
        <span className="mt-0.5 text-[8.5px] font-semibold uppercase tracking-[0.18em] text-slate-400 group-hover:text-slate-300 transition-colors">
          Safety Layer
        </span>
      </div>
    </div>
  );
}

export function LogoMark({ size = 64 }: { size?: number }) {
  return (
    <div className="relative flex items-center justify-center select-none group">
      {/* Outer ambient blur glow */}
      <div
        className="absolute -inset-3 rounded-3xl bg-gradient-to-tr from-lime-400/25 via-emerald-500/10 to-[#38bdf8]/25 blur-xl opacity-80 transition-opacity group-hover:opacity-100"
        style={{ width: size + 24, height: size + 24 }}
      />
      <ReGitIcon size={size} className="relative z-10" />
    </div>
  );
}

export function HealthRing({ score, size = 68 }: { score: number; size?: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * c;
  const color = score >= 80 ? "#bef264" : score >= 55 ? "#fbbf24" : "#fb7185";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#16202e" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-extrabold leading-none font-mono">{score}</span>
        <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-400">score</span>
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      {/* Modal Dialog Box */}
      <div
        className={cx(
          "relative w-full rounded-lg border border-white/[0.12] bg-[#0c1017] shadow-2xl transition-all overflow-hidden flex flex-col max-h-[88vh]",
          maxWidth
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3 bg-[#090e17]">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Content Body */}
        <div className="p-4 overflow-y-auto scroll-thin space-y-3">{children}</div>
      </div>
    </div>
  );
}
