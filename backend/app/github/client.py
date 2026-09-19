import re
import base64
import requests
from typing import Dict, Any, List, Optional, Tuple

GITHUB_API_BASE = "https://api.github.com"
DEFAULT_USER_AGENT = "ReGit-App"

# Owner/repo names on GitHub are alphanumerics plus `.`, `_`, `-` (owner cannot
# start with a hyphen in practice; keeping the first character alphanumeric
# also rules out `.`/`..` path segments on its own).
_COMPONENT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def _valid_component(value: str) -> bool:
    """True for a safe owner or repository name (no traversal, spaces, tricks)."""
    return (
        bool(value)
        and len(value) <= 100
        and value not in (".", "..")
        and bool(_COMPONENT_RE.match(value))
    )

def get_headers(token: Optional[str] = None) -> Dict[str, str]:
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": DEFAULT_USER_AGENT,
    }
    if token:
        headers["Authorization"] = f"Bearer {token.strip()}"
    return headers

def parse_github_url(url: str) -> Optional[Tuple[str, str]]:
    """
    Parses a GitHub URL into (owner, repo_name).

    Only github.com URLs ever parse - this is the single choke point that keeps
    other hosts (internal services, arbitrary SSH hosts) out of the clone and
    API paths. Owner/repo components are additionally validated against
    traversal and control characters.

    Supports:
    - https://github.com/owner/repo
    - https://github.com/owner/repo.git
    - https://github.com/owner/repo/tree/anything
    - git@github.com:owner/repo.git
    """
    if not url:
        return None
    url = url.strip()
    if len(url) > 2048:
        return None

    parsed: Optional[Tuple[str, str]] = None

    # SSH format: git@github.com:owner/repo.git
    ssh_match = re.match(r"^git@github\.com:([^/:]+)/([^/:]+?)(?:\.git)?$", url)
    if ssh_match:
        parsed = (ssh_match.group(1), ssh_match.group(2))

    # HTTPS format: https://github.com/owner/repo(.git)? with optional
    # trailing path (tree/<branch>/..., blob/..., etc.)
    if parsed is None:
        https_match = re.match(
            r"^https?://(?:www\.)?github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/.*)?$",
            url,
            re.IGNORECASE,
        )
        if https_match:
            parsed = (https_match.group(1), https_match.group(2))

    if parsed is None:
        return None

    owner, repo_name = parsed
    if not _valid_component(owner) or not _valid_component(repo_name):
        return None
    return (owner, repo_name)

def canonical_github_url(url: str) -> Optional[str]:
    """
    The clean https URL for a GitHub repository, or None if `url` is not one.

    Used to canonicalize user-supplied URLs at the API boundary so only
    well-formed github.com URLs are ever stored.
    """
    parsed = parse_github_url(url)
    if not parsed:
        return None
    owner, repo_name = parsed
    return f"https://github.com/{owner}/{repo_name}"

def canonical_clone_url(url: str, token: Optional[str] = None) -> Optional[str]:
    """
    The URL handed to `git clone` - built from validated components only.

    Never clone a stored URL verbatim: it was user input at some point, and a
    verbatim clone would turn it into a request against whatever host it names
    (SSRF). The token, when present, is embedded the way git credential
    helpers do for x-access-token clones of private repositories.
    """
    parsed = parse_github_url(url)
    if not parsed:
        return None
    owner, repo_name = parsed
    if token and token.strip():
        return f"https://x-access-token:{token.strip()}@github.com/{owner}/{repo_name}.git"
    return f"https://github.com/{owner}/{repo_name}.git"


# Branch names get a conservative allowlist instead of git's full ref rules:
# letters, digits, and `.`, `_`, `/`, `-`, `+`. This keeps shell metacharacters
# (`;`, `|`, `&`, `$`, backtick...), whitespace, and ref-traversal (`..`,
# leading `-` which git parses as an option) out of every place a branch is
# interpolated - clone args, GitHub API paths, and ref strings.
_BRANCH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/+-]*$")


def validate_branch_name(branch: str) -> bool:
    """
    True when `branch` is a safe branch name.

    Deliberately stricter than git itself: no leading `-` (option injection
    into CLI git calls), no `..` (ref traversal), no `//`, no leading or
    trailing `/` or `.`, and nothing but the listed safe characters.
    """
    if not isinstance(branch, str):
        return False
    branch = branch.strip()
    if not branch or len(branch) > 200:
        return False
    if not _BRANCH_RE.match(branch):
        return False
    if ".." in branch or "//" in branch:
        return False
    if branch.endswith("/") or branch.endswith(".") or "/" in branch[:1]:
        return False
    return True


# File paths pushed through the GitHub Contents API. Slash-separated segments
# with the same character rules as branches; ".." segments and every form of
# absolute-path or option trickery are rejected outright.
_PATH_SEGMENT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")


def validate_file_path(path: str) -> bool:
    """
    True when `path` is a safe repository-relative file path.

    Rejects absolute paths, `..` traversal, empty or doubled segments, and
    control characters - the value ends up in API URLs and ref lookups.
    """
    if not isinstance(path, str):
        return False
    path = path.strip().lstrip("/")
    if not path or len(path) > 512:
        return False
    if "\\" in path or "\x00" in path:
        return False
    segments = path.split("/")
    if any(
        seg in ("", ".", "..")
        or not _PATH_SEGMENT_RE.match(seg)
        for seg in segments
    ):
        return False
    return True

def validate_github_token(token: str) -> Dict[str, Any]:
    """
    Validates a GitHub Personal Access Token or OAuth token.
    Calls GET /user and returns user profile data.
    """
    if not token or not token.strip():
        return {"ok": False, "error": "Token cannot be empty."}

    try:
        resp = requests.get(
            f"{GITHUB_API_BASE}/user",
            headers=get_headers(token),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            scopes_header = resp.headers.get("X-OAuth-Scopes", "")
            scopes = [s.strip() for s in scopes_header.split(",") if s.strip()]
            return {
                "ok": True,
                "user": {
                    "login": data.get("login"),
                    "name": data.get("name") or data.get("login"),
                    "email": data.get("email"),
                    "avatar_url": data.get("avatar_url"),
                    "html_url": data.get("html_url"),
                    "public_repos": data.get("public_repos", 0),
                    "total_private_repos": data.get("total_private_repos", 0),
                    "scopes": scopes,
                }
            }
        elif resp.status_code == 401:
            return {"ok": False, "error": "Invalid GitHub token. Please verify the token is active and correct."}
        else:
            return {"ok": False, "error": f"GitHub API error ({resp.status_code}): {resp.text}"}
    except requests.RequestException as e:
        return {"ok": False, "error": f"Network error contacting GitHub: {str(e)}"}

def get_primary_email(token: str) -> Optional[str]:
    """
    Returns the account's primary verified email address.

    Requires the `user:email` scope. Only verified addresses are returned, so
    the value is safe to use for identity matching during OAuth sign-in.
    """
    if not token:
        return None

    try:
        resp = requests.get(
            f"{GITHUB_API_BASE}/user/emails",
            headers=get_headers(token),
            timeout=10
        )
        if resp.status_code != 200:
            return None

        emails = resp.json()
        if not isinstance(emails, list):
            return None

        primary = next((e for e in emails if e.get("primary") and e.get("verified")), None)
        if primary and primary.get("email"):
            return primary["email"]

        verified = next((e for e in emails if e.get("verified") and e.get("email")), None)
        if verified:
            return verified["email"]

        return None
    except (requests.RequestException, ValueError):
        return None


def list_github_repos(token: str) -> Dict[str, Any]:
    """
    Lists repositories accessible to the authenticated user.
    """
    if not token:
        return {"ok": False, "error": "Authentication token required to list repositories."}

    try:
        url = f"{GITHUB_API_BASE}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator"
        resp = requests.get(url, headers=get_headers(token), timeout=15)
        if resp.status_code != 200:
            return {"ok": False, "error": f"Failed to fetch repositories ({resp.status_code}): {resp.text}"}

        repos_raw = resp.json()
        repos = []
        for r in repos_raw:
            repos.append({
                "id": r.get("id"),
                "name": r.get("name"),
                "full_name": r.get("full_name"),
                "owner": r.get("owner", {}).get("login"),
                "private": r.get("private", False),
                "html_url": r.get("html_url"),
                "clone_url": r.get("clone_url"),
                "default_branch": r.get("default_branch", "main"),
                "description": r.get("description") or "No description provided.",
                "language": r.get("language") or "Other",
                "stargazers_count": r.get("stargazers_count", 0),
                "fork": r.get("fork", False),
                "updated_at": r.get("updated_at"),
            })
        return {"ok": True, "repositories": repos}
    except requests.RequestException as e:
        return {"ok": False, "error": f"Network error fetching repositories: {str(e)}"}

def get_repo_branches(token: str, owner: str, repo_name: str) -> List[str]:
    """
    Fetches the list of branches for a given repository.
    """
    try:
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo_name}/branches?per_page=100"
        resp = requests.get(url, headers=get_headers(token), timeout=10)
        if resp.status_code == 200:
            return [b["name"] for b in resp.json() if "name" in b]
        return ["main"]
    except Exception:
        return ["main"]

def ensure_branch_exists(token: str, owner: str, repo_name: str, branch: str, base_branch: str = "main") -> bool:
    """
    Checks if a target branch exists. If not, creates it from the base branch.
    """
    headers = get_headers(token)
    # Check if branch exists
    check_resp = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo_name}/branches/{branch}",
        headers=headers,
        timeout=10
    )
    if check_resp.status_code == 200:
        return True

    # Branch doesn't exist, get base branch ref
    base_resp = requests.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo_name}/git/ref/heads/{base_branch}",
        headers=headers,
        timeout=10
    )
    if base_resp.status_code != 200:
        # Try master if base was main
        alt_base = "master" if base_branch == "main" else "main"
        base_resp = requests.get(
            f"{GITHUB_API_BASE}/repos/{owner}/{repo_name}/git/ref/heads/{alt_base}",
            headers=headers,
            timeout=10
        )
        if base_resp.status_code != 200:
            return False

    base_sha = base_resp.json().get("object", {}).get("sha")
    if not base_sha:
        return False

    # Create new ref
    create_resp = requests.post(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo_name}/git/refs",
        headers=headers,
        json={"ref": f"refs/heads/{branch}", "sha": base_sha},
        timeout=10
    )
    return create_resp.status_code in (200, 201)

def commit_file_to_github(
    token: str,
    github_url: str,
    file_path: str,
    content: str,
    commit_message: str,
    branch: str = "main",
    author_name: str = "ReGit User",
    author_email: str = "user@regit.dev"
) -> Dict[str, Any]:
    """
    Commits and pushes a file directly to GitHub using the GitHub Contents API.
    Returns commit SHA, file URL, and commit details.
    """
    parsed = parse_github_url(github_url)
    if not parsed:
        return {"ok": False, "error": f"Invalid GitHub URL: {github_url}"}

    owner, repo_name = parsed
    headers = get_headers(token)

    # Ensure clean path
    clean_path = file_path.lstrip("/")

    # Ensure branch exists
    ensure_branch_exists(token, owner, repo_name, branch)

    # Check if the file already exists on this branch to obtain current SHA
    get_file_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo_name}/contents/{clean_path}?ref={branch}"
    file_sha = None
    try:
        check_file = requests.get(get_file_url, headers=headers, timeout=10)
        if check_file.status_code == 200:
            file_sha = check_file.json().get("sha")
    except Exception as e:
        print(f"[GitHub Client] File check notice: {e}")

    # Encode content in base64
    encoded_content = base64.b64encode(content.encode("utf-8")).decode("utf-8")

    payload: Dict[str, Any] = {
        "message": commit_message.strip() or f"Update {clean_path} via ReGit",
        "content": encoded_content,
        "branch": branch,
        "committer": {
            "name": author_name,
            "email": author_email,
        }
    }
    if file_sha:
        payload["sha"] = file_sha

    put_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo_name}/contents/{clean_path}"
    try:
        put_resp = requests.put(put_url, headers=headers, json=payload, timeout=15)
        if put_resp.status_code in (200, 201):
            res_data = put_resp.json()
            commit_info = res_data.get("commit", {})
            return {
                "ok": True,
                "commit_sha": commit_info.get("sha"),
                "commit_url": commit_info.get("html_url"),
                "file_path": clean_path,
                "branch": branch,
                "message": commit_info.get("message")
            }
        else:
            return {
                "ok": False,
                "error": f"Failed to commit file ({put_resp.status_code}): {put_resp.json().get('message', put_resp.text)}"
            }
    except requests.RequestException as e:
        return {"ok": False, "error": f"Network error during GitHub commit: {str(e)}"}
