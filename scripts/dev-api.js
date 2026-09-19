#!/usr/bin/env node
/**
 * Dev helper: start the Flask backend on PORT (default 5000) without the
 * "Address already in use" crash when a backend from a previous session is
 * still holding the port.
 *
 * Behaviour:
 *  1. If /api/health already answers with our Flask payload -> reuse it and
 *     idle (a healthy backend is already serving; Flask's debug reloader will
 *     pick up code changes on its own).
 *  2. If the port is busy with something else -> try to free it (fuser/lsof),
 *     then start Flask.
 *  3. If the port is free -> start Flask.
 *
 * Used by `npm run dev` (via concurrently) and `npm run dev:api`.
 */
const { spawn, spawnSync } = require("child_process");
const http = require("http");
const net = require("net");

const PORT = Number(process.env.PORT || 5000);
const HEALTH_PATH = "/api/health";

function checkHealth(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: PORT, path: HEALTH_PATH, timeout: timeoutMs },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(body);
            resolve(Boolean(j && j.ok === true && j.backend === "flask"));
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

function portBusy() {
  return new Promise((resolve) => {
    const s = net.connect(PORT, "127.0.0.1");
    s.on("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Best-effort: kill whatever holds the port (same user). */
function killPortHolder() {
  // Linux: fuser -k kills the holder directly.
  const fuser = spawnSync("fuser", ["-k", `${PORT}/tcp`], { stdio: "ignore" });
  if (!fuser.error && fuser.status === 0) return true;

  // Fallback: lsof lists PIDs, then kill them.
  const lsof = spawnSync("lsof", ["-t", "-i", `tcp:${PORT}`], {
    encoding: "utf8",
  });
  if (!lsof.error && lsof.status === 0 && lsof.stdout.trim()) {
    const pids = lsof.stdout.trim().split(/\s+/).filter(Boolean);
    const kill = spawnSync("kill", ["-9", ...pids], { stdio: "ignore" });
    if (!kill.error && kill.status === 0) return true;
  }
  return false;
}

(async () => {
  // 1) Healthy Flask backend already running -> reuse it.
  if (await checkHealth()) {
    console.log(
      `[api] Flask backend already running on port ${PORT} - reusing it.`
    );
    // Keep the concurrently lane alive while the reused backend is healthy.
    // If it goes down, exit 0 (not a failure) so `--kill-others-on-fail`
    // does not tear down `next dev` because of someone else's process.
    for (;;) {
      await sleep(5000);
      if (!(await checkHealth())) {
        console.error(
          `[api] The reused Flask backend on port ${PORT} is no longer responding.`
        );
        process.exit(0);
      }
    }
  }

  // 2) Port busy with something that is not our backend -> try to free it.
  if (await portBusy()) {
    console.log(`[api] Port ${PORT} is busy - freeing it...`);
    killPortHolder();
    await sleep(700);
    if (await portBusy()) {
      console.error(
        `[api] Could not free port ${PORT}. Stop the program using it and retry.`
      );
      process.exit(1);
    }
  }

  // 3) Port is free -> start Flask.
  const child = spawn("python3", ["backend/run.py"], { stdio: "inherit" });
  child.on("exit", (code, signal) => {
    if (signal) process.exit(0);
    process.exit(code ?? 1);
  });
})().catch((err) => {
  console.error("[api] Unexpected error:", err);
  process.exit(1);
});
