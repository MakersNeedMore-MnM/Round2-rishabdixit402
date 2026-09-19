import uuid
import json
from datetime import datetime
from typing import Dict, Any, List
from backend.app.db.connection import query_one, query_all, execute, execute_many
from backend.app.analysis.parsers import parse_file
from backend.app.analysis.graph import CodeIntelligenceGraph
from backend.app.rules.engine import RuleEngine
from backend.app.janitor.analyzer import JanitorAnalyzer
from backend.app.db.seed_data import DEMO_FILES

import os
import queue
import signal
import time
import tempfile
import subprocess
import shutil
import threading
from pathlib import Path
from backend.app.analysis.scanner import scan_directory
from backend.app.github.client import canonical_clone_url, validate_branch_name

# Dependency/vendored directories we never want to download or index. Keeping
# them out of the checkout is the difference between a 19s/280MB clone and a
# 3s/1.6MB one on a repository that committed its virtualenv.
UNWANTED_DIRS = (
    "venv",
    ".venv",
    "env",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "__pycache__",
    ".next",
    ".pytest_cache",
    ".idea",
    ".vscode",
)

CLONE_TIMEOUT = 120
# Scans are network + IO heavy, so a small fixed pool keeps a bulk import from
# firing dozens of simultaneous clones.
MAX_CONCURRENT_SCANS = 2
# How often the sweeper looks for repositories that are still waiting to be
# scanned. Short enough that files appear on their own, cheap enough to ignore.
SWEEP_INTERVAL = 5
SWEEP_BATCH = 20

_scan_queue: "queue.Queue[str]" = queue.Queue()
_worker_lock = threading.Lock()
_workers_started = False
# Repositories queued or being scanned right now, so a repository is never
# scanned twice at the same time.
_inflight: "set[str]" = set()
_inflight_lock = threading.Lock()


def start_analysis_async(repo_id: str) -> None:
    """
    Queue a scan and return immediately.

    Scanning shallow-clones the repository and can take minutes, so it must
    never run inside the HTTP request: the proxy/client would drop the
    connection long before it finished (ECONNRESET / "socket hang up"). Work is
    handed to a small pool of background workers and progress is reported
    through the repository `status` field, which callers flip to 'analyzing'
    before queueing so the UI has something to show right away.
    """
    _enqueue(repo_id)


def _enqueue(repo_id: str) -> bool:
    """Queue a scan unless the repository is already queued or running."""
    with _inflight_lock:
        if repo_id in _inflight:
            return False
        _inflight.add(repo_id)

    _ensure_workers()
    _scan_queue.put(repo_id)
    return True


def _ensure_workers() -> None:
    global _workers_started
    with _worker_lock:
        if _workers_started:
            return
        _workers_started = True
        for i in range(MAX_CONCURRENT_SCANS):
            threading.Thread(target=_worker_loop, name=f"regit-scan-{i}", daemon=True).start()
        threading.Thread(target=_sweeper_loop, name="regit-scan-sweeper", daemon=True).start()


def claim_pending_scans(limit: int = SWEEP_BATCH) -> List[str]:
    """
    Ids of the repositories that are waiting to be scanned.

    Anything already queued in this process is skipped, so a repository is never
    scanned twice at once. The status is deliberately left 'pending' here and
    only becomes 'analyzing' when a worker really starts on it, so the UI shows
    what is running instead of the whole backlog looking busy.
    """
    waiting = query_all(
        """
        SELECT id FROM repositories
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT %s
        """,
        (limit,),
    ) or []

    with _inflight_lock:
        return [row["id"] for row in waiting if row["id"] not in _inflight]


def _sweeper_loop() -> None:
    """
    Scan repositories that are still waiting, without anyone asking.

    The scan queue lives in memory, so importing repositories and then losing
    the process (restart, debug reloader, crash) used to leave rows stuck on
    'pending' with an empty file list forever. This makes it self-healing: a
    'pending' repository always ends up either 'ready' or 'error'.
    """
    while True:
        time.sleep(SWEEP_INTERVAL)
        try:
            for repo_id in claim_pending_scans():
                _enqueue(repo_id)
        except Exception as e:
            print(f"[Analysis] Sweeper notice: {e}")


def _worker_loop() -> None:
    while True:
        repo_id = _scan_queue.get()
        try:
            # Flip the status here, not when queueing: it should say what is
            # actually running rather than showing the whole backlog as busy.
            execute(
                "UPDATE repositories SET status = 'analyzing', updated_at = %s WHERE id = %s",
                (datetime.now(), repo_id)
            )
            _run_analysis_safe(repo_id)
        finally:
            with _inflight_lock:
                _inflight.discard(repo_id)
            _scan_queue.task_done()


def reset_stale_scans() -> None:
    """
    Scans run in this process, so anything still marked 'analyzing' at startup
    belongs to a worker that no longer exists. Reset it so it can be scanned
    again instead of spinning forever.
    """
    try:
        now = datetime.now()
        rows = execute(
            "UPDATE repositories SET status = 'pending', updated_at = %s WHERE status = 'analyzing' RETURNING id",
            (now,)
        )
        reset = len(rows or [])
        if reset:
            print(f"[Analysis] Reset {reset} interrupted scan(s) back to 'pending'")

        # The same reasoning applies to the run records, otherwise the last run
        # of a killed process stays 'running' in the overview forever.
        execute(
            "UPDATE analyses SET status = 'failed', finished_at = %s WHERE status = 'running'",
            (now,)
        )
    except Exception as e:
        print(f"[Analysis] Could not reset interrupted scans: {e}")


def bootstrap_scanning() -> None:
    """
    Start the scan engine as soon as the process does.

    Repositories left mid-scan by a previous process have no worker behind them
    any more, and repositories imported before scans were queued stay 'pending'
    forever. Bringing the workers up here means file lists heal themselves
    instead of staying empty until somebody clicks Scan.
    """
    reset_stale_scans()
    _ensure_workers()


def _clear_dir(dest: str) -> None:
    """Empty a directory so a retry can clone into it again."""
    for entry in Path(dest).iterdir():
        if entry.is_dir():
            shutil.rmtree(entry, ignore_errors=True)
        else:
            try:
                entry.unlink()
            except OSError:
                pass


def _run_git(cmd):
    """
    Run a git command that is guaranteed to terminate.

    Git asks for credentials on stdin when a repository is private or missing,
    and inside a server process that prompt is never answered - the clone then
    sits there forever, holding a scan worker hostage so every other repository
    stays unscanned. Git is told to fail instead of prompting, and the whole
    process group is killed on timeout, because git's helpers keep the pipes
    open and would otherwise outlive a kill of the parent alone.
    """
    env = dict(
        os.environ,
        GIT_TERMINAL_PROMPT="0",
        GIT_ASKPASS="echo",
        GCM_INTERACTIVE="never",
    )
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
        start_new_session=True,
    )
    try:
        stdout, stderr = proc.communicate(timeout=CLONE_TIMEOUT)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            proc.kill()
        proc.communicate()
        raise ValueError(f"git timed out after {CLONE_TIMEOUT}s")
    return subprocess.CompletedProcess(cmd, proc.returncode, stdout, stderr)


def _shallow_clone(url: str, branch: str, dest: str) -> bool:
    """
    Clone just enough of the repository to analyse the code.

    Prefers a blobless sparse checkout that excludes vendored dependency
    directories, because a plain shallow clone of a repo that committed its
    virtualenv downloads hundreds of MB only to be discarded. Falls back to a
    plain shallow clone for older git versions or hosts without blob filters.
    """
    def run(cmd):
        return _run_git(cmd)

    sparse_cmd = ["git", "clone", "--depth", "1", "--quiet", "--single-branch", "--filter=blob:none", "--sparse"]
    if branch:
        sparse_cmd += ["--branch", branch]
    sparse_cmd += [url, dest]

    try:
        proc = run(sparse_cmd)
        if proc.returncode == 0:
            patterns = ["/*"] + [f"!{d}/" for d in UNWANTED_DIRS]
            run(["git", "-C", dest, "sparse-checkout", "set", "--no-cone", *patterns])
            return True
        print(f"[Scanner] Sparse clone unavailable, using a full shallow clone: {proc.stderr.strip()[:160]}")
    except Exception as e:
        print(f"[Scanner] Sparse clone notice: {e}")

    # Fall back to a plain shallow clone, with and without an explicit branch
    _clear_dir(dest)
    for attempt_branch in ([branch, None] if branch else [None]):
        cmd = ["git", "clone", "--depth", "1", "--quiet", "--single-branch"]
        if attempt_branch:
            cmd += ["--branch", attempt_branch]
        cmd += [url, dest]
        try:
            if run(cmd).returncode == 0:
                return True
        except Exception as e:
            print(f"[Scanner] Clone notice: {e}")
        _clear_dir(dest)
    return False


def _run_analysis_safe(repo_id: str) -> None:
    try:
        analyze_repository_full(repo_id)
    except Exception as e:
        # Never leave a repository stuck on 'analyzing' - surface it as failed.
        print(f"[Analysis] repository {repo_id} failed: {e}")
        now = datetime.now()
        execute("UPDATE repositories SET status = 'error', updated_at = %s WHERE id = %s", (now, repo_id))
        execute(
            "UPDATE analyses SET status = 'failed', finished_at = %s WHERE repository_id = %s AND status = 'running'",
            (now, repo_id)
        )

def analyze_repository_full(repo_id: str) -> Dict[str, Any]:
    # 1. Fetch repo
    repo = query_one("SELECT * FROM repositories WHERE id = %s", (repo_id,))
    if not repo:
        raise ValueError(f"Repository {repo_id} not found")

    # Update status to analyzing
    execute("UPDATE repositories SET status = 'analyzing' WHERE id = %s", (repo_id,))

    # Create analysis run record
    analysis_id = str(uuid.uuid4())
    execute(
        """
        INSERT INTO analyses (id, repository_id, status, commit_sha, started_at)
        VALUES (%s, %s, 'running', 'HEAD', %s)
        """,
        (analysis_id, repo_id, datetime.now())
    )

    # 2. Get or fetch repository files
    files = query_all("SELECT * FROM repo_files WHERE repository_id = %s", (repo_id,))
    github_url = repo.get("github_url") or ""
    is_demo = repo.get("is_demo", False)
    branch = (repo.get("branch") or "main").strip()

    # The branch is passed as a CLI argument to `git clone --branch <name>`;
    # a tampered value (option injection, traversal, metacharacters) must never
    # get that far.
    if not validate_branch_name(branch):
        raise ValueError(f"Repository '{repo.get('name')}' has an invalid branch name.")

    # If non-demo and empty, or reanalyzing a real GitHub repository:
    if not files and not is_demo and (github_url.startswith("http://") or github_url.startswith("https://") or github_url.startswith("git@")):
        try:
            # Never clone the stored URL verbatim - it was user input once.
            # canonical_clone_url rebuilds it from validated github.com owner/
            # repo components and returns None for anything else, so no other
            # host can ever reach the git client (SSRF defense).
            user_rec = query_one("SELECT github_token FROM users WHERE id = %s", (repo.get("user_id"),))
            effective_token = (user_rec.get("github_token") if user_rec else None) or os.getenv("GITHUB_TOKEN")
            clone_target_url = canonical_clone_url(github_url, effective_token)
            if not clone_target_url:
                raise ValueError(
                    f"Repository '{repo.get('name')}' has an unsupported URL. Only github.com repositories can be scanned."
                )

            with tempfile.TemporaryDirectory() as tmpdir:
                if not _shallow_clone(clone_target_url, branch, tmpdir):
                    raise ValueError(
                        f"Unable to clone '{repo.get('name')}'. Check the repository URL and that branch '{branch}' exists."
                    )

                scanned = scan_directory(tmpdir)
                if scanned:
                    execute_many(
                        """
                        INSERT INTO repo_files (id, repository_id, path, language, content, loc, status)
                        VALUES %s
                        """,
                        [
                            (str(uuid.uuid4()), repo_id, sf["path"], sf["language"], sf["content"], sf["loc"], "analyzed")
                            for sf in scanned
                        ]
                    )
                    files = query_all("SELECT * FROM repo_files WHERE repository_id = %s", (repo_id,))
        except Exception as e:
            print(f"[Scanner] Git clone/scan notice: {e}")

    # Fallback to demo files ONLY if repository is explicitly a demo
    if not files:
        if is_demo:
            execute_many(
                """
                INSERT INTO repo_files (id, repository_id, path, language, content, loc, status)
                VALUES %s
                """,
                [
                    (str(uuid.uuid4()), repo_id, df["path"], df["language"], df["content"], len(df["content"].splitlines()), "analyzed")
                    for df in DEMO_FILES
                ]
            )
            files = query_all("SELECT * FROM repo_files WHERE repository_id = %s", (repo_id,))
        else:
            raise ValueError(f"Unable to clone or scan repository '{repo.get('name')}'. Please verify the repository URL is public and accessible.")

    # Clean old entities, relationships, findings, cleanup_items for this repo
    execute("DELETE FROM entities WHERE repository_id = %s", (repo_id,))
    execute("DELETE FROM relationships WHERE repository_id = %s", (repo_id,))
    execute("DELETE FROM findings WHERE repository_id = %s", (repo_id,))
    execute("DELETE FROM cleanup_items WHERE repository_id = %s", (repo_id,))

    # 3. Parse each file
    all_entities = []
    all_relationships = []
    lang_stats = {}

    file_id_map = {f["path"]: f["id"] for f in files}

    # Parse everything first, then write each table in one batched statement -
    # committing per row is what made scanning slow, not the parsing itself.
    entity_rows = []
    relationship_rows = []

    for f in files:
        lang = f["language"]
        lang_stats[lang] = lang_stats.get(lang, 0) + 1

        ents, rels = parse_file(f["path"], lang, f["content"])
        fid = file_id_map.get(f["path"])

        for e in ents:
            eid = str(uuid.uuid4())
            ed = e.to_dict()
            ed["id"] = eid
            all_entities.append(ed)
            entity_rows.append(
                (eid, repo_id, fid, ed["type"], ed["name"], ed["qualified_name"], ed["file_path"], ed["line_start"], ed["line_end"], ed["signature"], json.dumps(ed["metadata"]))
            )

        for r in rels:
            rid = str(uuid.uuid4())
            rd = r.to_dict()
            rd["id"] = rid
            all_relationships.append(rd)
            relationship_rows.append(
                (rid, repo_id, rd["source_name"], rd["source_file"], rd["target_name"], rd["type"], rd["confidence"], rd["line_no"], rd["snippet"])
            )

    execute_many(
        """
        INSERT INTO entities (id, repository_id, file_id, type, name, qualified_name, file_path, line_start, line_end, signature, metadata)
        VALUES %s
        """,
        entity_rows
    )
    execute_many(
        """
        INSERT INTO relationships (id, repository_id, source_name, source_file, target_name, type, confidence, line_no, snippet)
        VALUES %s
        """,
        relationship_rows
    )

    # 4. Build Code Intelligence Graph
    cg = CodeIntelligenceGraph()
    cg.build_from_records(all_entities, all_relationships)

    # 5. Run Rule Engine
    rule_engine = RuleEngine()
    findings = rule_engine.evaluate(files, all_entities, all_relationships)

    execute_many(
        """
        INSERT INTO findings (id, analysis_id, repository_id, rule_id, severity, title, description, evidence, file_path, symbol, line_start, line_end, status)
        VALUES %s
        """,
        [
            (str(uuid.uuid4()), analysis_id, repo_id, fd["rule_id"], fd["severity"], fd["title"], fd["description"], json.dumps(fd["evidence"]), fd["file_path"], fd.get("symbol"), fd["line_start"], fd["line_end"], "open")
            for fd in findings
        ]
    )

    # 6. Run Code Janitor
    janitor = JanitorAnalyzer()
    cleanup_items = janitor.analyze(files, all_entities, all_relationships)

    execute_many(
        """
        INSERT INTO cleanup_items (id, analysis_id, repository_id, type, target, file_path, confidence, description, preview, status)
        VALUES %s
        """,
        [
            (str(uuid.uuid4()), analysis_id, repo_id, item["type"], item["target"], item["file_path"], item["confidence"], item["description"], item["preview"], "pending")
            for item in cleanup_items
        ]
    )

    # 7. Update repository stats
    fn_count = sum(1 for e in all_entities if e["type"] in ("Function", "Component"))
    api_count = sum(1 for e in all_entities if e["type"] == "API")
    dep_count = sum(1 for r in all_relationships if r["type"] == "imports")

    now = datetime.now()
    execute(
        """
        UPDATE repositories
        SET status = 'ready',
            language_stats = %s,
            total_files = %s,
            total_functions = %s,
            total_apis = %s,
            total_dependencies = %s,
            last_analyzed_at = %s,
            updated_at = %s
        WHERE id = %s
        """,
        (json.dumps(lang_stats), len(files), fn_count, api_count, dep_count, now, now, repo_id)
    )

    # Mark analysis run completed
    execute(
        """
        UPDATE analyses
        SET status = 'completed',
            finished_at = %s,
            stats = %s
        WHERE id = %s
        """,
        (now, json.dumps({
            "files": len(files),
            "entities": len(all_entities),
            "relationships": len(all_relationships),
            "findings": len(findings),
            "cleanup": len(cleanup_items)
        }), analysis_id)
    )

    return {
        "repositoryId": repo_id,
        "analysisId": analysis_id,
        "totalFiles": len(files),
        "totalEntities": len(all_entities),
        "totalRelationships": len(all_relationships),
        "findingsCount": len(findings),
        "cleanupCount": len(cleanup_items)
    }
