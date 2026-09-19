"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FolderGit2,
  Network,
  ShieldCheck,
  Wand2,
  LogOut,
  Menu,
  X,
  Plus,
  RefreshCw,
} from "lucide-react";
import { cx } from "@/lib/utils";
import { Logo } from "./ui";

interface Repo {
  id: string;
  name: string;
  branch?: string;
  status: string;
  isDemo: boolean;
}

export function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; email: string; hue: number };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [activeRepo, setActiveRepo] = useState<string>("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/repositories")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.repositories) {
          setRepos(j.repositories);
          const stored = localStorage.getItem("regit_repo");
          const found = j.repositories.find((x: Repo) => x.id === stored);
          const pick = found ?? j.repositories.find((x: Repo) => x.isDemo) ?? j.repositories[0];
          if (pick) {
            setActiveRepo(pick.id);
            localStorage.setItem("regit_repo", pick.id);
          }
        }
      })
      .catch(() => null);
  }, []);

  // expose active repo globally via event + localStorage
  useEffect(() => {
    if (!activeRepo) return;
    localStorage.setItem("regit_repo", activeRepo);
    window.dispatchEvent(new CustomEvent("regit:repo", { detail: activeRepo }));
  }, [activeRepo]);

  useEffect(() => {
    const h = () => {
      const v = localStorage.getItem("regit_repo");
      if (v && v !== activeRepo) setActiveRepo(v);
    };
    window.addEventListener("regit:repo-sync", h);
    return () => window.removeEventListener("regit:repo-sync", h);
  }, [activeRepo]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    // Land on the public home page, not the sign-in screen.
    router.push("/");
    router.refresh();
  }

  async function reseed() {
    setSyncing(true);
    try {
      await fetch("/api/seed", { method: "POST" });
      const res = await fetch("/api/repositories");
      if (res.ok) {
        const r = await res.json();
        if (r.repositories) setRepos(r.repositories);
      }
      router.refresh();
    } finally {
      setSyncing(false);
    }
  }

  const nav = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/dashboard/repositories", label: "Repositories", icon: FolderGit2 },
    { href: "/dashboard/impact", label: "Impact", icon: Network },
    { href: "/dashboard/safety", label: "Safety", icon: ShieldCheck },
    { href: "/dashboard/janitor", label: "Janitor", icon: Wand2 },
  ];

  const sidebar = (
    <div className="flex h-full flex-col border-r border-white/[0.07] bg-[#090e17] text-slate-300">
      {/* Brand header */}
      <div className="flex h-13 items-center justify-between border-b border-white/[0.06] px-4">
        <Link href="/dashboard" className="transition-opacity hover:opacity-90">
          <Logo size={28} />
        </Link>
        <span className="rounded bg-lime-400/10 px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-lime-300">
          v1.0
        </span>
      </div>

      {/* Repo selector */}
      <div className="border-b border-white/[0.06] p-2.5">
        <div className="flex items-center justify-between px-2 pb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Workspace</span>
          <Link
            href="/dashboard/repositories"
            className="flex items-center gap-1 text-[11px] font-medium text-lime-300 hover:underline"
          >
            <Plus className="h-3 w-3" /> Add
          </Link>
        </div>
        <div className="space-y-0.5 max-h-[140px] overflow-y-auto scroll-thin">
          {repos.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setActiveRepo(r.id);
                setMobileOpen(false);
              }}
              className={cx(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors",
                activeRepo === r.id
                  ? "bg-lime-400/15 text-lime-200"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
              )}
            >
              <span
                className={cx(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  r.status === "ready" ? "bg-lime-400" : r.status === "analyzing" ? "bg-amber-400 animate-pulse" : "bg-slate-500"
                )}
              />
              <span className="truncate font-mono">{r.name}</span>
              {r.isDemo && (
                <span className="ml-auto shrink-0 rounded bg-[#58a6ff]/15 px-1 py-0.2 text-[8.5px] font-bold text-[#79b8ff]">
                  DEMO
                </span>
              )}
            </button>
          ))}
          {repos.length === 0 && (
            <p className="px-2 py-1 text-[11.5px] text-slate-500">Loading repos…</p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-2.5">
        <span className="block px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Navigation</span>
        {nav.map((n) => {
          const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setMobileOpen(false)}
              className={cx(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                active
                  ? "bg-white/10 text-white font-semibold"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
              )}
            >
              <n.icon className={cx("h-3.5 w-3.5", active ? "text-lime-300" : "text-slate-400")} />
              {n.label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-lime-300" />}
            </Link>
          );
        })}
      </nav>

      {/* User profile & actions footer */}
      <div className="border-t border-white/[0.06] p-2.5">
        <div className="flex items-center gap-2 px-1 py-1">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-black text-[#070b12]"
            style={{ background: `conic-gradient(from 180deg, hsl(${user.hue},80%,70%), hsl(${(user.hue + 60) % 360},80%,60%))` }}
          >
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-slate-200">{user.name}</p>
            <p className="truncate text-[10px] text-slate-400">{user.email}</p>
          </div>
        </div>
        <div className="mt-2 flex gap-1.5">
          <button
            onClick={reseed}
            disabled={syncing}
            className="flex flex-1 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw className={cx("h-3 w-3", syncing && "animate-spin text-lime-300")} /> {syncing ? "Seeding…" : "Reset demo"}
          </button>
          <button
            onClick={logout}
            className="flex items-center justify-center rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] font-medium text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"
            title="Sign out"
          >
            <LogOut className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#070b12] text-slate-100">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 lg:block">{sidebar}</aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-60 bg-[#090e17]">{sidebar}</aside>
        </div>
      )}

      <div className="relative lg:pl-56">
        {/* topbar */}
        <header className="sticky top-0 z-20 flex h-13 items-center justify-between border-b border-white/[0.06] bg-[#070b12]/90 px-4 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-slate-300 lg:hidden"
            >
              <Menu className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-400" />
              <span className="font-mono text-[11.5px] font-semibold text-slate-200">
                {repos.find((r) => r.id === activeRepo)?.name ?? "Select repository"}
              </span>
              <span className="text-[10px] text-slate-400">
                ({repos.find((r) => r.id === activeRepo)?.branch ?? "main"})
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="hidden sm:inline font-mono">Understand → Protect → Clean → Commit</span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-4 pb-12 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

export function useActiveRepo(): string {
  const [repo, setRepo] = useState("");
  useEffect(() => {
    // Always validate against the server: the stored id may be stale (deleted
    // repo, another account's repo), which previously left pages stuck forever.
    let alive = true;
    fetch("/api/repositories")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const list: Array<{ id: string; isDemo?: boolean }> = j?.repositories ?? [];
        if (list.length === 0) return;
        const stored = localStorage.getItem("regit_repo");
        const found = list.find((x) => x.id === stored);
        const pick = found ?? list.find((x) => x.isDemo) ?? list[0];
        if (pick && pick.id !== stored) {
          localStorage.setItem("regit_repo", pick.id);
          window.dispatchEvent(new CustomEvent("regit:repo", { detail: pick.id }));
        }
        if (pick) setRepo(pick.id);
      })
      .catch(() => null);
    const h = (e: Event) => setRepo((e as CustomEvent).detail);
    window.addEventListener("regit:repo", h);
    return () => {
      alive = false;
      window.removeEventListener("regit:repo", h);
    };
  }, []);
  return repo;
}
