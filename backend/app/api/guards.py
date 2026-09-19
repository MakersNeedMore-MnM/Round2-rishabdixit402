"""
Shared authorization guards for repository-scoped endpoints.

Every repository reads/writes must go through `get_owned_repository` (or its
`require_owner` variant) so one user can never touch another user's
repository - or a repository at all without being signed in.

The demo walkthrough stays public-read on purpose: the `demo@regit.dev`
account's `is_demo` repository is what anonymous visitors see. Everything else
demands the signed-in owner.
"""

from flask import jsonify
from backend.app.db.connection import query_one
from backend.app.api.auth import get_current_user

DEMO_EMAIL = "demo@regit.dev"


def load_repository(repo_id: str):
    """Fetch a repository row by id, or None when it does not exist."""
    return query_one("SELECT * FROM repositories WHERE id = %s", (repo_id,))


def get_owned_repository(repo_id: str, allow_demo_read: bool = True):
    """
    Resolve `<repo_id>` for the current request or return an error response.

    Returns a tuple of (repo, error_response). Exactly one of the two is None:

    - 401 when the caller is not signed in (unless the repository is the
      public demo one and `allow_demo_read` is set).
    - 404 when the repository does not exist, or belongs to somebody else.
      Returning 404 (not 403) avoids confirming to a stranger that the id
      exists.

    Demo behavior: the demo repository remains readable by anyone, so the
    unauthenticated walkthrough keeps working. Mutations (analyze, rename,
    delete, commit...) always require the signed-in owner via
    `require_owner`, which passes `allow_demo_read=False`.
    """
    user = get_current_user()

    if user:
        repo = load_repository(repo_id)
        if repo and repo.get("user_id") != user["id"]:
            # Somebody else's repository: same response as a missing one.
            return None, (jsonify({"error": "Repository not found"}), 404)
        return repo, None

    # Anonymous caller: only the public demo repository may be read, and only
    # when the endpoint opted into demo reads. Anything else is reported as
    # missing so the demo repository's existence is not leaked either.
    if not allow_demo_read:
        return None, (jsonify({"error": "Authentication required"}), 401)

    repo = load_repository(repo_id)
    if not repo or not repo.get("is_demo"):
        return None, (jsonify({"error": "Repository not found"}), 404)

    demo = query_one("SELECT id FROM users WHERE email = %s", (DEMO_EMAIL,))
    if demo and repo.get("user_id") == demo["id"]:
        return repo, None
    return None, (jsonify({"error": "Repository not found"}), 404)


def require_owner(repo_id: str):
    """
    Strict variant for mutating endpoints.

    Only the signed-in owner passes; everyone else gets 401 (anonymous) or 404
    (signed in, but not theirs / does not exist).
    """
    user = get_current_user()
    if not user:
        return None, None, (jsonify({"error": "Authentication required"}), 401)

    repo = load_repository(repo_id)
    if not repo or repo.get("user_id") != user["id"]:
        return None, user, (jsonify({"error": "Repository not found"}), 404)

    return repo, user, None


def load_item_with_repo(table: str, item_id: str):
    """
    Fetch a finding/cleanup row joined with its repository, for authorization.

    `table` is only ever called with a hardcoded name here, never user input.
    """
    return query_one(
        f"""
        SELECT t.*, r.user_id AS repo_user_id, r.is_demo AS repo_is_demo
        FROM {table} t
        JOIN repositories r ON r.id = t.repository_id
        WHERE t.id = %s
        """,
        (item_id,),
    )


def authorize_item(item, *, mutation: bool, kind: str = "Item"):
    """
    Check the current request may read or mutate a repo-owned row
    (a finding, a cleanup item, ...).

    - Signed-in non-owner sees 404, exactly like a missing row.
    - Anonymous callers may read the demo repository's items (walkthrough);
      mutations always need the signed-in owner.

    Returns an error response or None when allowed.
    """
    if not item:
        return jsonify({"error": f"{kind} not found"}), 404

    user = get_current_user()
    if user:
        if item["repo_user_id"] != user["id"]:
            return jsonify({"error": f"{kind} not found"}), 404
        return None

    if not mutation and item["repo_is_demo"]:
        demo = query_one("SELECT id FROM users WHERE email = %s", (DEMO_EMAIL,))
        if demo and item["repo_user_id"] == demo["id"]:
            return None
        return jsonify({"error": f"{kind} not found"}), 404

    return jsonify({"error": "Authentication required"}), 401
