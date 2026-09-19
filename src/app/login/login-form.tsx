"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Loader2, ArrowRight, FlaskConical } from "lucide-react";
import { LogoMark } from "@/components/ui";

// Error codes the GitHub OAuth callback may append as ?error=<code>.
const OAUTH_ERRORS: Record<string, string> = {
  github_not_configured:
    "GitHub sign-in isn't configured yet — set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
  github_denied: "GitHub sign-in was cancelled.",
  github_state_mismatch: "That sign-in link expired or was tampered with. Please try again.",
  github_failed: "GitHub sign-in failed. Please try again.",
};

function OAuthErrorBanner() {
  const code = useSearchParams().get("error");
  if (!code) return null;
  return (
    <p className="mt-3 rounded-full border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-center text-[12.5px] text-rose-200">
      {OAUTH_ERRORS[code] ?? "GitHub sign-in failed. Please try again."}
    </p>
  );
}

function GithubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@regit.dev");
  const [password, setPassword] = useState("regit-demo-123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Login failed");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="orb left-[-100px] top-[-100px] h-[320px] w-[320px] bg-lime-500/15" />
      <div className="orb bottom-[-120px] right-[-100px] h-[380px] w-[380px] bg-[#1f6feb]/25" />
      <div className="grid-dots absolute inset-0 opacity-60" />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Static circular logo mark */}
        <div className="mb-4 flex justify-center">
          <LogoMark size={64} />
        </div>

        {/* Pebble-smooth card: no straight corners */}
        <div className="blob-soft glass border-white/[0.08] p-7">
          <h1 className="text-center text-xl font-extrabold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-center text-[13px] text-slate-400">
            Check impact before you commit.
          </p>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/api/github/login";
            }}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-slate-100 transition-colors hover:border-lime-300/40 hover:bg-white/[0.1]"
          >
            <GithubIcon className="h-4 w-4" />
            Continue with GitHub
          </button>
          {/* A failed OAuth round trip redirects back here with ?error=<code> */}
          <Suspense fallback={null}>
            <OAuthErrorBanner />
          </Suspense>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
              or sign in with email
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-slate-300">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                placeholder="you@team.dev"
                className="pill-input w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-slate-300">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                placeholder="••••••••"
                className="pill-input w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
              />
            </div>
            {error && (
              <p className="rounded-full border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-center text-[12.5px] text-rose-200">
                {error}
              </p>
            )}
            <button
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-lime-300 px-4 py-2.5 text-sm font-bold text-[#0a0f0a] hover:bg-lime-200 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <button
            onClick={() => {
              setEmail("demo@regit.dev");
              setPassword("regit-demo-123");
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-[#58a6ff]/25 bg-[#58a6ff]/[0.07] px-4 py-2.5 text-[13px] font-semibold text-[#9ecbff] hover:bg-[#58a6ff]/15"
          >
            <FlaskConical className="h-4 w-4" /> Use demo credentials
          </button>

          <p className="mt-4 text-center text-[12.5px] text-slate-400">
            New to ReGit?{" "}
            <Link href="/register" className="font-semibold text-lime-300 hover:underline">
              Create account
            </Link>
          </p>
        </div>

        <p className="mt-4 text-center text-[11.5px] text-slate-600">
          Seeded demo repo analyzes on first load (no setup needed).
        </p>
      </div>
    </div>
  );
}
