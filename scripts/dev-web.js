#!/usr/bin/env node
/**
 * Dev helper: start the Next.js dev server on port 3000 without crashing when
 * a dev server from a previous session is already running.
 *
 * Next.js 16 refuses to boot a second dev server for the same project
 * ("Another next dev server is already running"), which would tear the whole
 * `npm run dev` stack down via concurrently. So:
 *
 *  1. If something already answers HTTP on the port -> reuse it and idle
 *     (Turbopack hot-reloads file changes, so the running server is current).
 *  2. If the port is busy but dead -> try to free it (fuser/lsof), then start.
 *  3. If the port is free -> start `next dev`.
 *
 * Used by `npm run dev` (via concurrently) and `npm run dev:web`.
 */
const { spawn, spawnSync } = require("child_process");
const http = require("http");
const net = require("net");

const PORT = Number(process.env.PORT || 3000);

/** Any HTTP response (even an error status) means a live server. */
function checkServer(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: PORT, path: "/", timeout: timeoutMs },
      (res) => {
        res.resume(); // drain so the socket closes
        resolve(true);
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
  const fuser = spawnSync("fuser", ["-k", `${PORT}/tcp`], { stdio: "ignore" });
  if (!fuser.error && fuser.status === 0) return true;

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
  // 1) A dev server is already serving -> reuse it.
  if (await checkServer()) {
    console.log(
      `[web] Next.js dev server already running on port ${PORT} - reusing it.`
    );
    for (;;) {
      await sleep(5000);
      if (!(await checkServer())) {
        console.error(
          `[web] The reused Next.js dev server on port ${PORT} is no longer responding.`
        );
        process.exit(0);
      }
    }
  }

  // 2) Port busy with something that does not answer HTTP -> try to free it.
  if (await portBusy()) {
    console.log(`[web] Port ${PORT} is busy - freeing it...`);
    killPortHolder();
    await sleep(700);
    if (await portBusy()) {
      console.error(
        `[web] Could not free port ${PORT}. Stop the program using it and retry.`
      );
      process.exit(1);
    }
  }

  // 3) Port is free -> start Next.js dev server.
  const child = spawn("next", ["dev"], { stdio: "inherit" });
  child.on("exit", (code, signal) => {
    if (signal) process.exit(0);
    process.exit(code ?? 1);
  });
})().catch((err) => {
  console.error("[web] Unexpected error:", err);
  process.exit(1);
});
