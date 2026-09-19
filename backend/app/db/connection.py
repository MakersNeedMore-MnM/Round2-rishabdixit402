import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager
from backend.app.config import Config

_pool = None

def init_db():
    global _pool
    if _pool is None:
        _pool = ThreadedConnectionPool(1, 20, Config.DATABASE_URL)
        # Ensure schema migrations for GitHub integration
        try:
            with get_db_cursor(commit=True) as cur:
                cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS github_token TEXT;")
                cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS github_username TEXT;")
                cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS github_avatar_url TEXT;")
        except Exception as e:
            print(f"[DB Init] Schema migration notice: {e}")

def get_db():
    global _pool
    if _pool is None:
        init_db()
    try:
        conn = _pool.getconn()
        if conn.closed:
            _pool.putconn(conn, close=True)
            conn = _pool.getconn()
        return conn
    except Exception:
        return psycopg2.connect(Config.DATABASE_URL)

def release_db(conn):
    if conn is None:
        return
    if _pool is not None:
        try:
            if conn in _pool._used.values() or conn in getattr(_pool, "_pool", []):
                _pool.putconn(conn, close=bool(conn.closed))
                return
        except Exception:
            pass
    try:
        conn.close()
    except Exception:
        pass

@contextmanager
def get_db_cursor(commit=False):
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        yield cur
        if commit:
            conn.commit()
        else:
            conn.rollback()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            cur.close()
        except Exception:
            pass
        release_db(conn)

def query_all(sql, params=None):
    with get_db_cursor() as cur:
        cur.execute(sql, params or ())
        return cur.fetchall()

def query_one(sql, params=None):
    with get_db_cursor() as cur:
        cur.execute(sql, params or ())
        return cur.fetchone()

def execute(sql, params=None, commit=True):
    with get_db_cursor(commit=commit) as cur:
        cur.execute(sql, params or ())
        try:
            return cur.fetchall()
        except Exception:
            return None

def execute_many(sql, rows):
    """
    Insert many rows in a single round trip and a single commit.

    `execute` commits per call, and a scan writes thousands of rows. Committing
    each one turned a 37-file repository into a two minute scan, almost all of
    it spent waiting on fsync. Batching the rows into one statement keeps the
    whole scan in a single transaction.

    `sql` must contain a single `VALUES %s` placeholder.
    """
    rows = list(rows or [])
    if not rows:
        return
    with get_db_cursor(commit=True) as cur:
        execute_values(cur, sql, rows)
