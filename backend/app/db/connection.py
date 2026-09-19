import os
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager
from backend.app.config import Config

_pool = None
_pool_pid = None

def init_db():
    global _pool, _pool_pid
    current_pid = os.getpid()
    if _pool is None or _pool_pid != current_pid:
        if _pool is not None:
            try:
                _pool.closeall()
            except Exception:
                pass
        _pool = ThreadedConnectionPool(1, 20, Config.DATABASE_URL)
        _pool_pid = current_pid
        # Ensure schema migrations for GitHub integration
        try:
            with get_db_cursor(commit=True) as cur:
                cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS github_token TEXT;")
                cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS github_username TEXT;")
                cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS github_avatar_url TEXT;")
        except Exception as e:
            print(f"[DB Init] Schema migration notice: {e}")

def get_db():
    global _pool, _pool_pid
    current_pid = os.getpid()
    if _pool is None or _pool_pid != current_pid:
        init_db()
    try:
        conn = _pool.getconn()
        if conn.closed:
            _pool.putconn(conn, close=True)
            conn = _pool.getconn()
        return conn
    except Exception:
        return psycopg2.connect(Config.DATABASE_URL)

def release_db(conn, close=False):
    if conn is None:
        return
    global _pool, _pool_pid
    current_pid = os.getpid()
    if _pool is not None and _pool_pid == current_pid:
        try:
            if conn in _pool._used.values() or conn in getattr(_pool, "_pool", []):
                _pool.putconn(conn, close=close or bool(conn.closed))
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
    is_bad = False
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        yield cur
        if commit:
            conn.commit()
        else:
            conn.rollback()
    except psycopg2.OperationalError:
        is_bad = True
        try:
            conn.rollback()
        except Exception:
            pass
        raise
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
        release_db(conn, close=is_bad)

def query_all(sql, params=None):
    try:
        with get_db_cursor() as cur:
            cur.execute(sql, params or ())
            return cur.fetchall()
    except psycopg2.OperationalError:
        with get_db_cursor() as cur:
            cur.execute(sql, params or ())
            return cur.fetchall()

def query_one(sql, params=None):
    try:
        with get_db_cursor() as cur:
            cur.execute(sql, params or ())
            return cur.fetchone()
    except psycopg2.OperationalError:
        with get_db_cursor() as cur:
            cur.execute(sql, params or ())
            return cur.fetchone()

def execute(sql, params=None, commit=True):
    def _run():
        with get_db_cursor(commit=commit) as cur:
            cur.execute(sql, params or ())
            try:
                return cur.fetchall()
            except Exception:
                return None
    try:
        return _run()
    except psycopg2.OperationalError:
        return _run()

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
