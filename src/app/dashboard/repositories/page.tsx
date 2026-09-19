"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Loader2,
  RefreshCw,
  Trash2,
  Pencil,
  GitBranch,
  ExternalLink,
  Check,
  FolderGit2,
  FileCode,
  Search,
  GitCommit,
  UploadCloud,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Unplug,
  FileText,
  AlertCircle,
  Copy,
} from "lucide-react";
import { EmptyState, LoadingDots, Modal } from "@/components/ui";
import { timeAgo, cx } from "@/lib/utils";

function GithubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

interface Repo {
  id: string;
  name: string;
  githubUrl: string;
  branch: string;
  description: string | null;
  status: string;
  totalFiles: number;
  totalFunctions: number;
  totalApis: number;
  isDemo: boolean;
  createdAt: string;
  lastAnalyzedAt: string | null;
}

interface GitHubStatus {
  connected: boolean;
  username: string | null;
  avatarUrl: string | null;
  hasToken?: boolean;
}

interface RepoFileItem {
  id: string;
  path: string;
  language: string;
  loc: number;
  status: string;
  entity_count?: number;
}

interface FileEntity {
  id: string;
  type: string;
  name: string;
  qualified_name: string;
  line_start: number;
  line_end: number;
  signature?: string;
}

export default function ReposPage() {
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [activeRepoId, setActiveRepoId] = useState<string>("");

  // GitHub Auth state
  const [ghStatus, setGhStatus] = useState<GitHubStatus>({
    connected: false,
    username: null,
    avatarUrl: null,
  });
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [patToken, setPatToken] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [patBusy, setPatBusy] = useState(false);
  const [patError, setPatError] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState("");

  // File Viewer & Commit state
  const [viewingRepo, setViewingRepo] = useState<Repo | null>(null);
  const [repoFiles, setRepoFiles] = useState<RepoFileItem[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<RepoFileItem | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [fileEntities, setFileEntities] = useState<FileEntity[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const [fileTab, setFileTab] = useState<"view" | "edit">("view");
  const [editedCode, setEditedCode] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [commitBranch, setCommitBranch] = useState("");
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState<{ sha: string; url: string; branch: string } | null>(null);
  const [commitError, setCommitError] = useState("");
  const [copiedSha, setCopiedSha] = useState(false);

  async function loadRepos(): Promise<Repo[]> {
    setLoading(true);
    try {
      const res = await fetch("/api/repositories");
      if (!res.ok) return [];
      const json = await res.json();
      const list: Repo[] = json.repositories ?? [];
      setRepos(list);
      return list;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function checkGitHubStatus(): Promise<GitHubStatus> {
    try {
      const res = await fetch("/api/github/status");
      const json = await res.json();
      const status: GitHubStatus = {
        connected: Boolean(json.connected),
        username: json.username || null,
        avatarUrl: json.avatarUrl || null,
      };
      setGhStatus(status);
      return status;
    } catch {
      // Ignore background fetch error
      return { connected: false, username: null, avatarUrl: null };
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [localRepos, status] = await Promise.all([loadRepos(), checkGitHubStatus()]);
      if (cancelled) return;

      setActiveRepoId(localStorage.getItem("regit_repo") ?? "");

      // The OAuth token already carries the access we need, so surface the
      // account's GitHub repositories without a Personal Access Token or an
      // extra click: right after a GitHub sign-in, or on a first visit where
      // nothing has been imported yet.
      const justConnected =
        new URLSearchParams(window.location.search).get("github") === "connected";

      if (status.connected && (justConnected || localRepos.length === 0)) {
        syncGitHubRepos();
      }
      if (justConnected) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Mount-only: reads the OAuth redirect param and localStorage exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scans run in the background, so keep the list fresh while any repository is
  // still waiting or scanning. Statuses and file counts then fill in on their
  // own instead of needing a manual reload.
  const scanInFlight = repos.some((r) => r.status === "pending" || r.status === "analyzing");

  useEffect(() => {
    if (!scanInFlight) return;
    const timer = setInterval(async () => {
      const list = await loadRepos();

      // If the file explorer is open on a repository that just finished, pull
      // its files in so the user does not have to close and reopen it.
      const openId = viewingRepo?.id;
      const openRepo = openId ? list.find((x) => x.id === openId) : undefined;
      if (openRepo && openRepo.status !== viewingRepo?.status) {
        setViewingRepo(openRepo);
        if (openRepo.status === "ready") openFileViewer(openRepo);
      }
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanInFlight, viewingRepo?.id, viewingRepo?.status]);

  async function handleConnectPAT(e: React.FormEvent) {
    e.preventDefault();
    setPatBusy(true);
    setPatError("");
    try {
      const res = await fetch("/api/github/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: patToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPatError(data.error || "Failed to validate GitHub token.");
        return;
      }
      setGhStatus({
        connected: true,
        username: data.user?.login || "connected",
        avatarUrl: data.user?.avatarUrl || null,
      });
      setPatToken("");
      setShowConnectModal(false);
      // Pull the account's repositories in straight away
      await syncGitHubRepos();
    } catch (err: any) {
      setPatError(err?.message || "Network error connecting to GitHub.");
    } finally {
      setPatBusy(false);
    }
  }

  async function handleDisconnectGitHub() {
    if (!confirm("Disconnect GitHub account from ReGit? Your connected repositories will remain in the database.")) {
      return;
    }
    try {
      await fetch("/api/github/disconnect", { method: "POST" });
      setGhStatus({ connected: false, username: null, avatarUrl: null });
    } catch {
      // Ignore
    }
  }

  // Imports every repository the connected account can access, as lightweight
  // entries with no scanning. Scanning is a separate, per-repo action.
  async function syncGitHubRepos() {
    setSyncBusy(true);
    setSyncError("");
    try {
      const res = await fetch("/api/github/import-repos", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(data.error || "Failed to import repositories from GitHub.");
        return;
      }
      await loadRepos();
    } catch {
      setSyncError("Network error while importing repositories from GitHub.");
    } finally {
      setSyncBusy(false);
    }
  }

  async function connectManual(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const tempId = `temp-${Date.now()}`;
    const optimistic: Repo = {
      id: tempId,
      name: name || url.split("/").pop() || "new-repo",
      githubUrl: url,
      branch,
      description: null,
      status: "analyzing",
      totalFiles: 0,
      totalFunctions: 0,
      totalApis: 0,
      isDemo: false,
      createdAt: new Date().toISOString(),
      lastAnalyzedAt: null,
    };
    setRepos((r) => [optimistic, ...r]);
    try {
      const res = await fetch("/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubUrl: url, branch, name: name || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRepos((r) => r.filter((x) => x.id !== tempId));
        setError(json.error ?? "Failed to connect repository");
        return;
      }
      setRepos((r) => [json.repository, ...r.filter((x) => x.id !== tempId)]);
      setUrl("");
      setName("");
      setShowForm(false);
      select(json.repository.id);
      // Land straight on the new repository's overview; the page polls while
      // the background scan finishes, so stats fill in on their own.
      router.push("/dashboard");
    } catch {
      setRepos((r) => r.filter((x) => x.id !== tempId));
      setError("Network error connecting repository");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Disconnect this repository? Analysis graph and findings will be deleted.")) return;
    const prev = repos;
    setRepos((r) => r.filter((x) => x.id !== id));
    const res = await fetch(`/api/repositories/${id}`, { method: "DELETE" });
    if (!res.ok) setRepos(prev);
  }

  async function saveEdit(id: string) {
    const prev = repos;
    setRepos((r) => r.map((x) => (x.id === id ? { ...x, name: editName } : x)));
    setEditing(null);
    const res = await fetch(`/api/repositories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    });
    if (!res.ok) setRepos(prev);
  }

  // Kicks off a scan and waits for it by polling the repository status. The
  // backend scans in the background on purpose - awaiting the whole scan would
  // time out on large repositories.
  async function reanalyze(id: string) {
    setAnalyzing(id);
    setRepos((r) => r.map((x) => (x.id === id ? { ...x, status: "analyzing" } : x)));
    try {
      const res = await fetch(`/api/repositories/${id}/analyze`, { method: "POST" });
      if (!res.ok) return;

      // Open the scanned repository's overview right away: the overview page
      // polls the scan status itself, so stats appear there as soon as the
      // background scan finishes.
      select(id);
      router.push("/dashboard");
    } finally {
      setAnalyzing(null);
    }
  }

  function select(id: string) {
    setActiveRepoId(id);
    localStorage.setItem("regit_repo", id);
    window.dispatchEvent(new CustomEvent("regit:repo", { detail: id }));
  }

  // File Viewer handlers
  async function openFileViewer(repo: Repo) {
    setViewingRepo(repo);
    setSelectedFile(null);
    setFileContent("");
    setFileEntities([]);
    setCommitSuccess(null);
    setCommitError("");
    setCommitBranch(repo.branch || "main");
    setFilesLoading(true);
    try {
      const res = await fetch(`/api/repositories/${repo.id}/files`);
      const json = await res.json();
      if (json.files) {
        setRepoFiles(json.files);
        if (json.files.length > 0) {
          loadFileDetail(repo.id, json.files[0]);
        }
      }
    } finally {
      setFilesLoading(false);
    }
  }

  async function loadFileDetail(repoId: string, file: RepoFileItem) {
    setSelectedFile(file);
    setContentLoading(true);
    setCommitSuccess(null);
    setCommitError("");
    setCommitMsg(`Update ${file.path} via ReGit`);
    try {
      const res = await fetch(`/api/repositories/${repoId}/files/${file.id}`);
      const json = await res.json();
      if (json.file) {
        const text = json.file.content || "";
        setFileContent(text);
        setEditedCode(text);
        setFileEntities(json.entities || []);
      }
    } finally {
      setContentLoading(false);
    }
  }

  async function handleCommitAndPush() {
    if (!viewingRepo || !selectedFile) return;
    setCommitBusy(true);
    setCommitError("");
    setCommitSuccess(null);
    try {
      const res = await fetch(`/api/repositories/${viewingRepo.id}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: selectedFile.path,
          content: editedCode,
          commitMessage: commitMsg.trim(),
          branch: commitBranch.trim() || viewingRepo.branch || "main",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCommitError(data.error || "Commit failed.");
        return;
      }
      setCommitSuccess({
        sha: data.commitSha || "Committed",
        url: data.commitUrl || `${viewingRepo.githubUrl}/commits`,
        branch: data.branch || commitBranch,
      });
      setFileContent(editedCode);
      setFileTab("view");
    } catch (err: any) {
      setCommitError(err?.message || "Network error during commit.");
    } finally {
      setCommitBusy(false);
    }
  }

  const filteredRepoFiles = repoFiles.filter((f) =>
    f.path.toLowerCase().includes(fileSearch.toLowerCase())
  );

  if (loading && repos.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingDots label="Loading connected repositories..." />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Slim header: title + count left, GitHub status and actions right */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[13px] font-bold text-slate-200">Repositories</h1>
          <span className="font-mono text-[11px] text-slate-500">{repos.length}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {ghStatus.connected ? (
            <div className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] py-1 pl-1 pr-1.5">
              {ghStatus.avatarUrl ? (
                <img
                  src={ghStatus.avatarUrl}
                  alt={ghStatus.username || "GitHub"}
                  className="h-5 w-5 rounded-full border border-lime-400/30"
                />
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.06]">
                  <GithubIcon className="h-3 w-3 text-slate-300" />
                </span>
              )}
              <span className="font-mono text-[11px] font-semibold text-slate-300">@{ghStatus.username}</span>
              <button
                onClick={syncGitHubRepos}
                disabled={syncBusy}
                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-lime-300 disabled:opacity-60"
                title="Pull in any new repositories from your GitHub account"
              >
                <RefreshCw className={cx("h-3 w-3", syncBusy && "animate-spin")} />
              </button>
              <button
                onClick={handleDisconnectGitHub}
                className="rounded-full p-1 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                title="Disconnect GitHub account"
              >
                <Unplug className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConnectModal(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11.5px] font-semibold text-slate-300 transition-colors hover:border-lime-400/30 hover:text-slate-100"
            >
              <GithubIcon className="h-3.5 w-3.5" />
              Connect GitHub
            </button>
          )}

          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-lime-300 px-3.5 py-1.5 text-[11.5px] font-bold text-[#0a0f0a] hover:bg-lime-200"
          >
            <Plus className="h-3.5 w-3.5" /> Add repository
          </button>
        </div>
      </div>

      {syncError && (
        <p className="rounded-full border border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
          {syncError}
        </p>
      )}

      {/* GitHub Account Connect Modal */}
      <Modal
        open={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        title={
          <div className="flex items-center gap-2">
            <GithubIcon className="h-4 w-4 text-lime-300" />
            <span>Connect GitHub Account (Personal Access Token)</span>
          </div>
        }
        subtitle="Authenticate ReGit to list private repositories, view code files, and push commits directly."
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleConnectPAT} className="space-y-3.5">
          <div className="rounded-md border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-slate-300 space-y-2">
            <p className="font-semibold text-slate-200">How to generate a token (takes 30 seconds):</p>
            <ol className="list-decimal list-inside space-y-1 text-[11.5px] text-slate-400">
              <li>
                Open{" "}
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="text-lime-300 underline inline-flex items-center gap-0.5 font-medium"
                >
                  GitHub Personal Access Tokens <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </li>
              <li>Click <strong>Generate new token (classic)</strong>.</li>
              <li>
                Select the <code className="bg-white/10 px-1 py-0.2 rounded text-lime-200 font-mono">repo</code> scope
                (gives access to browse repos, inspect files, and commit).
              </li>
              <li>Copy the token and paste it below.</li>
            </ol>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Personal Access Token (PAT)
            </label>
            <div className="relative">
              <input
                type={showPat ? "text" : "password"}
                value={patToken}
                onChange={(e) => setPatToken(e.target.value)}
                required
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="dev-input w-full font-mono text-xs pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPat(!showPat)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showPat ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[10.5px] text-slate-500 mt-1">
              Your token is stored safely and only used to interact with your GitHub account.
            </p>
          </div>

          {patError && (
            <p className="rounded border border-rose-500/25 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{patError}</span>
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-3">
            <button
              type="button"
              onClick={() => setShowConnectModal(false)}
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={patBusy || !patToken.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-lime-300 px-4 py-1.5 text-xs font-bold text-[#0a0f0a] hover:bg-lime-200 disabled:opacity-60"
            >
              {patBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {patBusy ? "Verifying Token..." : "Verify & Connect"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Connect Repository URL Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={
          <div className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-lime-300" />
            <span>Connect Public or Private Repository URL</span>
          </div>
        }
        subtitle="Repository code will be cloned, AST parsed, and integrated into the Safety Intelligence Graph."
        maxWidth="max-w-lg"
      >
        <form onSubmit={connectManual} className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">GitHub Repository URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://github.com/owner/repository"
              className="dev-input w-full font-mono text-xs"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Branch</label>
              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                className="dev-input w-full font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Display Name (optional)</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. backend-core"
                className="dev-input w-full text-xs"
              />
            </div>
          </div>

          {error && (
            <p className="rounded border border-rose-500/25 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-lime-300 px-4 py-1.5 text-xs font-bold text-[#0a0f0a] hover:bg-lime-200 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {busy ? "Scanning..." : "Connect & Analyze"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Repositories List */}
      {repos.length === 0 ? (
        <EmptyState
          icon={<FolderGit2 className="h-5 w-5" />}
          title="No repositories connected"
          hint={
            ghStatus.connected
              ? `Repos from @${ghStatus.username} are pulled in automatically - hit Scan on any of them to analyse it.`
              : "Connect your GitHub account to import your repositories or enter a repository URL directly."
          }
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (ghStatus.connected) {
                    syncGitHubRepos();
                  } else {
                    setShowConnectModal(true);
                  }
                }}
                disabled={syncBusy}
                className="inline-flex items-center gap-1.5 rounded-md bg-lime-300 px-3.5 py-1.5 text-xs font-bold text-[#0a0f0a] disabled:opacity-60"
              >
                {syncBusy && <RefreshCw className="h-3 w-3 animate-spin" />}
                {ghStatus.connected ? "Sync your GitHub repos" : "Connect GitHub Account"}
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="rounded-md border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-200"
              >
                Connect by URL
              </button>
            </div>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#0c1017]">
          <div className="divide-y divide-white/[0.04]">
            {repos.map((r) => {
              const isActive = activeRepoId === r.id;
              const statusTone =
                r.status === "ready"
                  ? "bg-lime-400"
                  : r.status === "error"
                    ? "bg-rose-400"
                    : "bg-amber-300 animate-pulse";

              return (
                <div
                  key={r.id}
                  className={cx(
                    "group/row relative flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 transition-colors",
                    isActive ? "bg-lime-400/[0.05]" : "hover:bg-white/[0.02]"
                  )}
                >
                  {/* Active accent: hairline on the left edge */}
                  {isActive && <span className="absolute inset-y-0 left-0 w-[2px] bg-lime-300" />}

                  {/* Status dot */}
                  <span
                    title={r.status}
                    className={cx("h-1.5 w-1.5 shrink-0 rounded-full", statusTone)}
                  />

                  {/* Name + meta: one quiet line, branch/url folded in */}
                  <div className="flex min-w-0 flex-1 items-baseline gap-2">
                    {editing === r.id ? (
                      <span className="flex items-center gap-1.5">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="dev-input w-36 text-xs"
                          autoFocus
                        />
                        <button onClick={() => saveEdit(r.id)} className="rounded-full bg-lime-300 p-1 text-[#0a0f0a]">
                          <Check className="h-3 w-3" />
                        </button>
                      </span>
                    ) : (
                      <span className="truncate text-[12.5px] font-bold text-slate-100">
                        {r.name}
                        {r.isDemo && (
                          <span className="ml-1.5 align-middle font-mono text-[9.5px] font-semibold uppercase tracking-wider text-[#79b8ff]/80">
                            demo
                          </span>
                        )}
                      </span>
                    )}
                    <span className="hidden items-center gap-1 font-mono text-[11px] text-slate-500 sm:flex">
                      <GitBranch className="h-3 w-3" />{r.branch}
                    </span>
                    <span className="hidden font-mono text-[11px] text-slate-600 md:inline">{r.totalFiles}f · {r.totalFunctions}fn · {r.totalApis}api</span>
                    <span className="hidden font-mono text-[11px] text-slate-600 lg:inline">· {timeAgo(r.lastAnalyzedAt ?? r.createdAt)}</span>
                  </div>

                  {/* Actions: quiet icons that wake up on hover */}
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => openFileViewer(r)}
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-100"
                      title="Browse files and push commits"
                    >
                      <FileCode className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Files</span>
                    </button>
                    <button
                      onClick={() => reanalyze(r.id)}
                      disabled={analyzing === r.id}
                      className="inline-flex items-center gap-1 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-lime-300 disabled:opacity-60"
                      title="Clone, parse and analyse this repository"
                    >
                      <RefreshCw className={cx("h-3.5 w-3.5", analyzing === r.id && "animate-spin")} />
                    </button>
                    <button
                      onClick={() => {
                        setEditing(r.id);
                        setEditName(r.name);
                      }}
                      className="rounded-full p-1.5 text-slate-500 opacity-0 transition-all hover:bg-white/[0.06] hover:text-slate-200 focus:opacity-100 group-hover/row:opacity-100"
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={r.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full p-1.5 text-slate-500 opacity-0 transition-all hover:bg-white/[0.06] hover:text-slate-200 focus:opacity-100 group-hover/row:opacity-100"
                      title="Open on GitHub"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    {!r.isDemo && (
                      <button
                        onClick={() => remove(r.id)}
                        className="rounded-full p-1.5 text-slate-500 opacity-0 transition-all hover:bg-rose-500/10 hover:text-rose-300 focus:opacity-100 group-hover/row:opacity-100"
                        title="Disconnect repository"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {!isActive && (
                      <button
                        onClick={() => select(r.id)}
                        className="ml-1 hidden rounded-full border border-white/[0.08] px-2.5 py-1 text-[10.5px] font-semibold text-slate-400 transition-colors hover:border-lime-300/40 hover:text-lime-300 group-hover/row:inline-flex lg:inline-flex"
                        title="Use this repository across the dashboard"
                      >
                        Set active
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* File Explorer, Code Viewer & Commit Modal */}
      <Modal
        open={Boolean(viewingRepo)}
        onClose={() => setViewingRepo(null)}
        title={
          <div className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-lime-300" />
            <span>{viewingRepo?.name} : File Explorer & Push</span>
            <span className="flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.2 font-mono text-[10px] text-slate-300">
              <GitBranch className="h-3 w-3" /> {viewingRepo?.branch}
            </span>
          </div>
        }
        subtitle="Inspect repository source files, review AST intelligence, and commit/push modifications directly to GitHub."
        maxWidth="max-w-5xl"
      >
        <div className="flex flex-col md:flex-row gap-3 h-[520px]">
          {/* Left: Files List */}
          <div className="w-full md:w-72 flex flex-col rounded-lg border border-white/[0.08] bg-[#080d14] p-2.5 shrink-0">
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
              <input
                value={fileSearch}
                onChange={(e) => setFileSearch(e.target.value)}
                placeholder="Filter files..."
                className="dev-input w-full pl-7 py-1 text-[11px]"
              />
            </div>

            <div className="flex items-center justify-between px-1 pb-1.5 text-[10.5px] font-mono text-slate-400 border-b border-white/[0.06]">
              <span>Files ({repoFiles.length})</span>
            </div>

            {filesLoading ? (
              <div className="flex-1 flex items-center justify-center py-6">
                <LoadingDots label="Loading files..." />
              </div>
            ) : filteredRepoFiles.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-1 px-2 text-center text-xs text-slate-500">
                {viewingRepo && viewingRepo.status !== "ready" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-lime-300" />
                    <span>
                      {viewingRepo.status === "error"
                        ? "This repository could not be scanned."
                        : "Scanning this repository... files will appear here shortly."}
                    </span>
                  </>
                ) : (
                  <span>
                    {fileSearch ? "No files match your filter" : "No files found"}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-1 pt-1 scroll-thin">
                {filteredRepoFiles.map((file) => {
                  const isSelected = selectedFile?.id === file.id;
                  return (
                    <button
                      key={file.id}
                      onClick={() => viewingRepo && loadFileDetail(viewingRepo.id, file)}
                      className={cx(
                        "w-full text-left rounded px-2 py-1.5 transition-colors text-xs flex items-center justify-between gap-1.5",
                        isSelected
                          ? "bg-lime-400/15 text-lime-200 font-semibold border border-lime-400/30"
                          : "text-slate-300 hover:bg-white/5"
                      )}
                    >
                      <div className="truncate min-w-0 flex items-center gap-1.5">
                        <FileCode className={cx("h-3.5 w-3.5 shrink-0", isSelected ? "text-lime-300" : "text-slate-500")} />
                        <span className="truncate font-mono text-[11px]">{file.path}</span>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-slate-500">
                        {file.loc} L
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Code Viewer, AST Entities, and Commit Panel */}
          <div className="flex-1 flex flex-col rounded-lg border border-white/[0.08] bg-[#080d14] overflow-hidden min-w-0">
            {selectedFile ? (
              <>
                {/* Header toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-white/[0.02] p-2.5 px-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-bold text-slate-200 truncate">
                      {selectedFile.path}
                    </span>
                    <span className="rounded bg-white/10 px-1.5 py-0.2 font-mono text-[10px] text-slate-400">
                      {selectedFile.language}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {selectedFile.loc} lines
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setFileTab("view")}
                      className={cx(
                        "rounded px-2.5 py-1 text-xs font-semibold transition-colors",
                        fileTab === "view"
                          ? "bg-lime-400/20 text-lime-300 border border-lime-400/30"
                          : "text-slate-400 hover:text-slate-200"
                      )}
                    >
                      View Code
                    </button>
                    <button
                      onClick={() => setFileTab("edit")}
                      className={cx(
                        "rounded px-2.5 py-1 text-xs font-semibold transition-colors flex items-center gap-1",
                        fileTab === "edit"
                          ? "bg-lime-400/20 text-lime-300 border border-lime-400/30"
                          : "text-slate-400 hover:text-slate-200"
                      )}
                    >
                      <GitCommit className="h-3 w-3" /> Edit & Push
                    </button>
                  </div>
                </div>

                {/* AST Symbols bar */}
                {fileEntities.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/[0.06] bg-white/[0.01] overflow-x-auto scroll-thin">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 shrink-0">
                      AST Symbols ({fileEntities.length}):
                    </span>
                    {fileEntities.map((ent) => (
                      <span
                        key={ent.id}
                        className="shrink-0 rounded bg-white/5 border border-white/10 px-1.5 py-0.2 font-mono text-[10px] text-slate-300"
                      >
                        <span className="text-lime-300 font-bold">{ent.type.slice(0, 1)}:</span> {ent.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Main Content Area */}
                {contentLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <LoadingDots label="Reading file content..." />
                  </div>
                ) : fileTab === "view" ? (
                  <div className="flex-1 overflow-auto bg-[#070b12] p-3 font-mono text-xs text-slate-200 scroll-thin">
                    <table className="w-full border-collapse">
                      <tbody>
                        {fileContent.split("\n").map((line, idx) => (
                          <tr key={idx} className="hover:bg-white/[0.02]">
                            <td className="w-10 pr-3 select-none text-right text-[10.5px] text-slate-600 border-r border-white/[0.06] font-mono">
                              {idx + 1}
                            </td>
                            <td className="pl-3 font-mono text-[11px] whitespace-pre text-slate-200">
                              {line || " "}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col overflow-hidden p-3 space-y-3 bg-[#070b12]">
                    <div className="flex-1 flex flex-col min-h-0">
                      <label className="text-[11px] font-semibold text-slate-400 mb-1">
                        Source Code Editor
                      </label>
                      <textarea
                        value={editedCode}
                        onChange={(e) => setEditedCode(e.target.value)}
                        className="flex-1 w-full dev-input font-mono text-xs leading-relaxed resize-none p-2.5 scroll-thin"
                        spellCheck={false}
                      />
                    </div>

                    {/* Commit & Push box */}
                    <div className="rounded-md border border-white/[0.08] bg-white/[0.02] p-3 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                          <UploadCloud className="h-3.5 w-3.5 text-lime-300" />
                          Commit & Push to GitHub
                        </span>
                        {!ghStatus.connected && (
                          <span className="text-[10.5px] text-amber-300">
                            Connect your GitHub account to push live commits.
                          </span>
                        )}
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className="block text-[10.5px] font-semibold text-slate-400 mb-0.5">
                            Target Branch
                          </label>
                          <input
                            value={commitBranch}
                            onChange={(e) => setCommitBranch(e.target.value)}
                            placeholder={viewingRepo?.branch || "main"}
                            className="dev-input w-full text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10.5px] font-semibold text-slate-400 mb-0.5">
                            Commit Message
                          </label>
                          <input
                            value={commitMsg}
                            onChange={(e) => setCommitMsg(e.target.value)}
                            placeholder="Describe your change..."
                            className="dev-input w-full text-xs"
                          />
                        </div>
                      </div>

                      {commitError && (
                        <p className="rounded border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-200">
                          {commitError}
                        </p>
                      )}

                      {commitSuccess && (
                        <div className="rounded border border-lime-400/30 bg-lime-400/10 p-2 text-xs text-lime-200 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold flex items-center gap-1 text-lime-300">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Pushed successfully!
                            </span>
                            <a
                              href={commitSuccess.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] underline inline-flex items-center gap-1 font-semibold text-lime-200 hover:text-white"
                            >
                              View on GitHub <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                          <p className="font-mono text-[10.5px] text-slate-300">
                            Commit SHA: {commitSuccess.sha} (branch: {commitSuccess.branch})
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-end">
                        <button
                          onClick={handleCommitAndPush}
                          disabled={commitBusy || !editedCode}
                          className="inline-flex items-center gap-1.5 rounded-md bg-lime-300 px-4 py-1.5 text-xs font-bold text-[#0a0f0a] hover:bg-lime-200 disabled:opacity-60"
                        >
                          {commitBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommit className="h-3.5 w-3.5" />}
                          {commitBusy ? "Pushing Commit..." : "Push to GitHub"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400">
                <FileText className="h-8 w-8 text-slate-600 mb-2" />
                <p className="text-xs font-semibold text-slate-300">No file selected</p>
                <p className="text-[11px] text-slate-500 max-w-xs mt-1">
                  Choose a file from the list on the left to inspect source code, detected symbols, or push commits.
                </p>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
