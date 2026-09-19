import Link from "next/link";
import {
  ArrowRight,
  GitBranch,
  Network,
  ShieldCheck,
  Wand2,
  Play,
  Check,
  LayoutDashboard,
  Sparkles,
  ScanSearch,
} from "lucide-react";
import { Logo, RingStat, FeatureOrb } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  // Signed-in visitors get dashboard actions instead of sign-in prompts, so
  // they are never asked to authenticate twice.
  const user = await getSessionUser();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070b12]">
      {/* Ambient orbs */}
      <div className="orb left-[-120px] top-[-120px] h-[380px] w-[380px] bg-lime-500/15" />
      <div className="orb right-[-140px] top-[8%] h-[440px] w-[440px] bg-[#1f6feb]/25" />
      <div className="orb bottom-[-160px] left-[30%] h-[360px] w-[360px] bg-violet-600/10" />
      <div className="grid-dots absolute inset-0 opacity-50" />

      {/* ---------------------------------------------------------------- Nav */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/" className="transition-opacity hover:opacity-95">
          <Logo size={32} />
        </Link>
        <div className="flex items-center gap-2">
          {user ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-4 py-2 text-[13px] font-bold text-[#0a0f0a] hover:bg-lime-200"
            >
              <LayoutDashboard className="h-3.5 w-3.5" /> Enter Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-semibold text-slate-200 hover:bg-white/10"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-lime-300 px-4 py-2 text-[13px] font-bold text-[#0a0f0a] hover:bg-lime-200"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-14">
        {/* ------------------------------------------------------- Hero */}
        <section className="mx-auto mt-4 grid max-w-5xl items-center gap-8 md:grid-cols-[1.15fr_.85fr]">
          <div className="text-center md:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/[0.06] px-3.5 py-1.5 text-[12px] text-lime-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-300" />
              AI-powered safety layer for modern developers
            </div>
            <h1 className="mt-5 text-[clamp(2.1rem,5vw,3.6rem)] font-extrabold leading-[1.03] tracking-tight">
              Before you change code,
              <br />
              <span className="bg-gradient-to-r from-lime-200 via-lime-300 to-[#58a6ff] bg-clip-text text-transparent">
                know what it will break.
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-slate-400 md:mx-0">
              ReGit connects to a GitHub repository, maps every function, API and component into a
              living graph, then shows the exact blast radius of your next change — before you
              commit it.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 md:justify-start">
              {user ? (
                <>
                  <Link
                    href="/dashboard"
                    className="animate-pulse-ring inline-flex items-center gap-2 rounded-full bg-lime-300 px-6 py-3 text-sm font-bold text-[#0a0f0a] hover:bg-lime-200"
                  >
                    <LayoutDashboard className="h-4 w-4" /> Enter Dashboard
                  </Link>
                  <Link
                    href="/dashboard/repositories"
                    className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-6 py-3 text-sm font-semibold hover:bg-white/10"
                  >
                    Your repositories <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/register"
                    className="animate-pulse-ring inline-flex items-center gap-2 rounded-full bg-lime-300 px-6 py-3 text-sm font-bold text-[#0a0f0a] hover:bg-lime-200"
                  >
                    <Play className="h-4 w-4" /> Try live demo
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-6 py-3 text-sm font-semibold hover:bg-white/10"
                  >
                    Open dashboard <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              )}
            </div>
            {!user && (
              <p className="mt-3 text-[12px] text-slate-500">
                Demo login:{" "}
                <span className="font-mono text-slate-300">demo@regit.dev</span> ·{" "}
                <span className="font-mono text-slate-300">regit-demo-123</span>
              </p>
            )}
          </div>

          {/* Orbiting system visual — pure SVG circles, no images needed */}
          <div className="relative mx-auto hidden aspect-square w-full max-w-[380px] md:block">
            <svg viewBox="0 0 380 380" className="h-full w-full">
              <defs>
                <radialGradient id="core" cx="35%" cy="30%" r="80%">
                  <stop offset="0%" stopColor="#bef264" stopOpacity=".95" />
                  <stop offset="55%" stopColor="#65a30d" stopOpacity=".55" />
                  <stop offset="100%" stopColor="#0b111c" stopOpacity=".9" />
                </radialGradient>
                <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#bef264" stopOpacity=".55" />
                  <stop offset="100%" stopColor="#58a6ff" stopOpacity=".4" />
                </linearGradient>
              </defs>

              {/* orbits */}
              <circle cx="190" cy="190" r="178" fill="none" stroke="rgba(255,255,255,.06)" strokeDasharray="3 7" />
              <circle cx="190" cy="190" r="132" fill="none" stroke="rgba(88,166,255,.14)" strokeDasharray="2 6" />
              <circle cx="190" cy="190" r="86" fill="none" stroke="rgba(190,242,100,.16)" strokeDasharray="2 6" />

              {/* graph edges */}
              <g stroke="url(#edge)" strokeWidth="1.1">
                <line x1="190" y1="190" x2="330" y2="128" />
                <line x1="190" y1="190" x2="302" y2="286" />
                <line x1="190" y1="190" x2="92" y2="88" />
                <line x1="190" y1="190" x2="66" y2="228" />
                <line x1="330" y1="128" x2="302" y2="286" />
                <line x1="92" y1="88" x2="66" y2="228" />
              </g>

              {/* core */}
              <circle cx="190" cy="190" r="46" fill="url(#core)" />
              <circle cx="190" cy="190" r="46" fill="none" stroke="rgba(190,242,100,.5)" strokeWidth="1" />
              <text x="190" y="186" textAnchor="middle" fill="#0a0f0a" fontSize="15" fontWeight="800" fontFamily="var(--font-sans)">
                impact
              </text>
              <text x="190" y="202" textAnchor="middle" fill="rgba(10,15,10,.75)" fontSize="9" fontWeight="600" fontFamily="var(--font-sans)">
                blast radius
              </text>

              {/* nodes */}
              <g fontFamily="var(--font-sans)" fontSize="9.5" fontWeight="700">
                <circle cx="330" cy="128" r="17" fill="#0c1424" stroke="rgba(190,242,100,.55)" strokeWidth="1.2" />
                <text x="330" y="131.5" textAnchor="middle" fill="#bef264">API</text>

                <circle cx="302" cy="286" r="17" fill="#0c1424" stroke="rgba(88,166,255,.55)" strokeWidth="1.2" />
                <text x="302" y="289.5" textAnchor="middle" fill="#79b8ff">UI</text>

                <circle cx="92" cy="88" r="17" fill="#0c1424" stroke="rgba(167,139,250,.55)" strokeWidth="1.2" />
                <text x="92" y="91.5" textAnchor="middle" fill="#c4b5fd">test</text>

                <circle cx="66" cy="228" r="17" fill="#0c1424" stroke="rgba(251,113,133,.55)" strokeWidth="1.2" />
                <text x="66" y="231.5" textAnchor="middle" fill="#fda4af">auth</text>
              </g>

              {/* satellite */}
              <circle cx="190" cy="12" r="5" fill="#bef264" />
            </svg>
            <div className="orbit-ring animate-orbit pointer-events-none absolute inset-6 z-0 rounded-full" />
          </div>
        </section>

        {/* ------------------------------------------ Pipeline (orbit pills) */}
        <section className="mt-12">
          <div className="flex flex-col items-center">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2.5">
              {[
                { icon: GitBranch, label: "Connect GitHub", tone: "text-slate-300" },
                { icon: ScanSearch, label: "Deep scan", tone: "text-[#9ecbff]" },
                { icon: Network, label: "Build graph", tone: "text-lime-300" },
                { icon: ShieldCheck, label: "Run safety rules", tone: "text-rose-300" },
                { icon: Sparkles, label: "AI explains", tone: "text-violet-300" },
                { icon: Wand2, label: "Clean & commit", tone: "text-amber-300" },
              ].map(({ icon: Icon, label, tone }, i) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="inverter-pill flex items-center gap-2 border border-white/10 bg-white/[0.03] px-4 py-2">
                    <Icon className={`h-3.5 w-3.5 ${tone}`} />
                    <span className="text-[12px] font-semibold text-slate-200">{label}</span>
                  </div>
                  {i < 5 && <span className="h-1 w-1 rounded-full bg-lime-300/60" />}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- Ring stats */}
        <section className="mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-7">
          <RingStat value="8" label="Safety rules" tone="lime" />
          <RingStat value="4" label="Languages" tone="blue" />
          <RingStat value="100%" label="Evidence-based" tone="violet" />
          <RingStat value="0" label="Auto-deletes" tone="amber" />
        </section>

        {/* ------------------------- Features: one interconnected panel */}
        <section className="mt-12">
          <div className="blob-soft relative border border-white/[0.08] bg-[#0b1119] p-8 shadow-[0_20px_60px_-30px_rgba(0,0,0,.8)]">
            {/* Dashed connector line running through the three orbs - the
                modules share one graph, so they share one panel. */}
            <div className="pointer-events-none absolute left-1/2 top-[122px] hidden w-3/5 -translate-x-1/2 border-t border-dashed border-white/12 md:block" />

            <div className="relative grid gap-10 md:grid-cols-3">
              {[
                {
                  icon: <Network className="h-6 w-6" />,
                  tone: "lime" as const,
                  badge: "Impact",
                  title: "Change Impact Analyzer",
                  body: (
                    <>
                      Rename <span className="font-mono text-slate-200">User.email</span> and
                      instantly see every file, API, component and test that must be reviewed —
                      ranked by confidence.
                    </>
                  ),
                },
                {
                  icon: <ShieldCheck className="h-6 w-6" />,
                  tone: "blue" as const,
                  badge: "Safety",
                  title: "Before You Commit",
                  body: (
                    <>
                      8 deterministic rules catch stale references, broken contracts, missing
                      auth, secret leaks and risky migrations. AI never decides — it only
                      explains.
                    </>
                  ),
                },
                {
                  icon: <Wand2 className="h-6 w-6" />,
                  tone: "violet" as const,
                  badge: "Janitor",
                  title: "Code Janitor",
                  body: (
                    <>
                      Unused imports, dead functions, unused dependencies and duplicates — with
                      cleanup previews that always require your approval.
                    </>
                  ),
                },
              ].map((f) => (
                <article key={f.title} className="flex flex-col items-center text-center">
                  <FeatureOrb icon={f.icon} tone={f.tone} badge={f.badge} />
                  <h3 className="mt-4 text-[15px] font-bold">{f.title}</h3>
                  <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-slate-400">
                    {f.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------- Walkthrough + why us */}
        <section className="mt-6 grid gap-4 md:grid-cols-[1fr_1.1fr]">
          <div className="blob-card relative flex flex-col items-center justify-center border border-lime-300/15 bg-[#0b111c] p-7 text-center">
            {/* Decorative ring: z-0 + pointer-events-none so it can never sit
                above (or swallow clicks meant for) the CTA below. */}
            <div className="orbit-ring animate-orbit-rev pointer-events-none absolute inset-4 z-0 rounded-full" />
            <div className="relative z-10 flex flex-col items-center">
              <p className="text-[13px] font-bold text-lime-200">Judge walkthrough · 90 seconds</p>
              <ol className="mt-4 space-y-2.5 text-left text-[13px] text-slate-300">
                {[
                  "Connect regit-demo → watch the scan finish",
                  "Impact: select User.email → see 12 files light up",
                  "Safety: open the stale-reference HIGH with evidence",
                  "Explain: one click for an AI remediation plan",
                  "Janitor: preview cleanup, approve, commit clean",
                ].map((x, i) => (
                  <li key={x} className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-lime-300/25 bg-lime-300/10 text-[11px] font-bold text-lime-200">
                      {i + 1}
                    </span>
                    {x}
                  </li>
                ))}
              </ol>
              <Link
                href={user ? "/dashboard" : "/register"}
                className="relative z-20 mt-5 inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-2.5 text-[13px] font-bold text-[#0a0f0a] hover:bg-lime-200"
              >
                Start the walkthrough <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="blob-soft border border-white/[0.08] bg-[#0b1119] p-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-lime-300" />
              <p className="text-[13px] font-bold">Why teams pick ReGit over IDE + linter + CI</p>
            </div>
            <ul className="mt-3.5 grid gap-2.5 text-[13px] text-slate-300 sm:grid-cols-2">
              {[
                "Repository-level blast radius, not just the open file",
                "Contract & auth risks grouped into one review checklist",
                "Deterministic evidence first: AI explains, never guesses",
                "Cleanup previews that never auto-delete code",
              ].map((x) => (
                <li key={x} className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-lime-300/15 text-lime-300">
                    <Check className="h-3 w-3" />
                  </span>
                  {x}
                </li>
              ))}
            </ul>
            {/* tech dots — connected chain instead of a card row */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {["Python AST", "TS parser", "Postgres graph", "BFS traversal", "Ollama / API"].map(
                (t, i, arr) => (
                  <span key={t} className="flex items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-slate-300">
                      {t}
                    </span>
                    {i < arr.length - 1 && <span className="h-1 w-1 rounded-full bg-[#58a6ff]/70" />}
                  </span>
                )
              )}
            </div>
          </div>
        </section>

        <footer className="mt-12 flex flex-col items-center gap-2 text-center">
          <Logo size={22} />
          <p className="text-[12px] text-slate-500">
            Built by <span className="font-semibold text-slate-300">rishabdixit4021</span> ·
            Understand → Protect → Clean → Commit
          </p>
        </footer>
      </main>
    </div>
  );
}
