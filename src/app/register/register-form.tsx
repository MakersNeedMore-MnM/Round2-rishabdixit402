"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, ArrowRight, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/ui";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Registration failed");
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
      <div className="orb right-[-100px] top-[-100px] h-[320px] w-[320px] bg-lime-500/15" />
      <div className="orb bottom-[-120px] left-[-100px] h-[380px] w-[380px] bg-[#1f6feb]/25" />
      <div className="grid-dots absolute inset-0 opacity-60" />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Static circular logo mark */}
        <div className="mb-4 flex justify-center">
          <LogoMark size={64} />
        </div>

        {/* Pebble-smooth card: no straight corners */}
        <div className="blob-soft glass border-white/[0.08] p-7">
          <h1 className="text-center text-xl font-extrabold tracking-tight">Create your workspace</h1>
          <p className="mt-1 text-center text-[13px] text-slate-400">
            Map your repo. Know the impact. Commit clean.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-slate-300">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Ada Lovelace"
                className="pill-input w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
              />
            </div>
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
                minLength={6}
                placeholder="6+ characters"
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
              {busy ? "Creating…" : "Create account"}
            </button>
          </form>

          {/* Trust dots: connected circular chain instead of a plain list */}
          <div className="mt-5 flex items-center justify-center gap-2">
            {["Scan in seconds", "Evidence first", "Nothing auto-deleted"].map((t, i, arr) => (
              <span key={t} className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-slate-300">
                  <ShieldCheck className="h-3 w-3 text-lime-300" />
                  {t}
                </span>
                {i < arr.length - 1 && <span className="h-1 w-1 rounded-full bg-lime-300/60" />}
              </span>
            ))}
          </div>

          <p className="mt-4 text-center text-[12.5px] text-slate-400">
            Have an account?{" "}
            <Link href="/login" className="font-semibold text-lime-300 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
