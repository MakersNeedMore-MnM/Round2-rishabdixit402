import os
from pathlib import Path
from typing import List, Dict, Any

DEFAULT_IGNORED_DIRS = {
    ".git",
    "node_modules",
    "venv",
    ".venv",
    "env",
    "dist",
    "build",
    ".next",
    "coverage",
    "__pycache__",
    ".pytest_cache",
    ".idea",
    ".vscode"
}

DEFAULT_IGNORED_EXTS = {
    ".pyc",
    ".pyo",
    ".pyd",
    ".so",
    ".dll",
    ".dylib",
    ".zip",
    ".tar",
    ".gz",
    ".png",
    ".jpg",
    ".jpeg",
    ".svg",
    ".ico",
    ".pdf",
    ".docx",
    ".webp",
    ".avif",
    ".gif",
    ".mp4",
    ".mp3",
    ".wav",
    ".ogg",
    ".webm",
    ".mov",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".eot",
    ".bin",
    ".wasm",
    ".map",
}

SECRET_PATTERNS = {
    ".env",
    ".env.local",
    ".env.production",
    "id_rsa",
    "id_ed25519",
    ".pem",
    ".key"
}

def is_secret_or_ignored_file(filename: str) -> bool:
    lower = filename.lower()
    for s in SECRET_PATTERNS:
        if s in lower:
            return True
    return False

def scan_directory(root_path: str) -> List[Dict[str, Any]]:
    files = []
    root = Path(root_path)
    if not root.exists():
        return files

    for dirpath, dirnames, filenames in os.walk(root):
        # Mutate dirnames to ignore directories in-place
        dirnames[:] = [d for d in dirnames if d not in DEFAULT_IGNORED_DIRS and not d.startswith(".")]

        for f in filenames:
            ext = Path(f).suffix.lower()
            if ext in DEFAULT_IGNORED_EXTS or is_secret_or_ignored_file(f):
                continue

            full_path = Path(dirpath) / f
            rel_path = str(full_path.relative_to(root))
            
            language = "unknown"
            if ext == ".py":
                language = "python"
            elif ext in (".js", ".jsx"):
                language = "javascript"
            elif ext in (".ts", ".tsx"):
                language = "typescript"
            elif ext == ".sql":
                language = "sql"
            elif ext in (".json", ".yaml", ".yml", ".md"):
                language = ext.lstrip(".")

            try:
                content = full_path.read_text(encoding="utf-8", errors="replace")
                if "\x00" in content:
                    continue  # Ignore binary files containing NUL bytes
                loc = len(content.splitlines())
                files.append({
                    "path": rel_path,
                    "language": language,
                    "content": content,
                    "loc": loc
                })
            except Exception:
                pass

    return files
