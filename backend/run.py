import os
import sys
from pathlib import Path

# Ensure backend directory is in sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app import create_app
from backend.app.config import Config

app = create_app()

# Bootstrap scanning workers for both WSGI production servers (gunicorn) and dev mode.
# Debug mode runs twice under Werkzeug reloader, so only start in the actual serving process.
if not Config.DEBUG or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
    try:
        from backend.app.analysis.service import bootstrap_scanning
        bootstrap_scanning()
    except Exception as e:
        print(f"[Warning] Could not bootstrap scan engine: {e}")

if __name__ == "__main__":
    print(f"🚀 Starting ReGit Flask Backend on http://0.0.0.0:{Config.PORT}...")
    app.run(host="0.0.0.0", port=Config.PORT, debug=Config.DEBUG)

