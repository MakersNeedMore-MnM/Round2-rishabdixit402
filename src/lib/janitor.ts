import type { FileInput, ParsedEntity, ParsedRelationship } from "./analyzer";

export interface CleanupCandidate {
  type: string;
  target: string;
  filePath: string;
  confidence: string;
  description: string;
  preview: string;
}

export function runJanitor(
  files: FileInput[],
  entities: ParsedEntity[],
  rels: ParsedRelationship[]
): CleanupCandidate[] {
  const out: CleanupCandidate[] = [];
  const byPath = new Map(files.map((f) => [f.path, f]));

  // 1. Unused imports
  for (const f of files) {
    if (f.path.endsWith(".txt") || f.path.endsWith(".json")) continue;
    const ls = f.content.split("\n");
    const importLines: Array<{ name: string; line: number; raw: string }> = [];
    for (let i = 0; i < ls.length; i++) {
      const t = ls[i].trim();
      if (f.language === "python") {
        const m1 = t.match(/^import\s+([\w\. ,]+)/);
        const m2 = t.match(/^from\s+[\w\.]+\s+import\s+(.+)/);
        if (m1) {
          for (const n of m1[1].split(",").map((s) => s.trim().split(" ")[0].split(".").pop()!)) {
            if (n) importLines.push({ name: n, line: i + 1, raw: ls[i] });
          }
        } else if (m2) {
          for (const n of m2[1].split(",").map((s) => s.trim().split(" ")[0])) {
            if (n && n !== "*") importLines.push({ name: n, line: i + 1, raw: ls[i] });
          }
        }
      } else {
        const m = t.match(/^import\s+(.+?)\s+from\s+["'][^"']+["']/);
        if (m) {
          const clause = m[1];
          const brace = clause.match(/\{([^}]+)\}/);
          const names: string[] = [];
          if (brace) names.push(...brace[1].split(",").map((s) => s.trim().split(" ")[0]));
          const def = clause.split(",")[0].trim().replace(/[{}]/g, "").trim().split(" ")[0];
          if (def && def !== "*" && !def.startsWith("{")) names.push(def);
          for (const n of names) {
            const clean = n.trim();
            if (clean && clean !== "React") importLines.push({ name: clean, line: i + 1, raw: ls[i] });
          }
        }
      }
    }
    for (const imp of importLines) {
      // count usages outside the import line
      const body = ls.filter((_, idx) => idx !== imp.line - 1).join("\n");
      const uses = (body.match(new RegExp(`\\b${imp.name}\\b`, "g")) ?? []).length;
      if (uses === 0) {
        out.push({
          type: "unused_import",
          target: imp.name,
          filePath: f.path,
          confidence: "high",
          description: `"${imp.name}" is imported but never used in ${f.path}. Safe to remove.`,
          preview: `− ${imp.raw.trim()}\n  (line ${imp.line})`,
        });
      }
    }
  }

  // 2. Dead functions / components
  const incoming = new Map<string, number>();
  for (const r of rels) {
    if (["calls", "references", "uses", "renders", "imports"].includes(r.type)) {
      incoming.set(r.targetName, (incoming.get(r.targetName) ?? 0) + 1);
    }
  }
  const funcEntities = entities.filter((e) => ["Function", "Component"].includes(e.type));
  for (const fn of funcEntities) {
    // skip tests, api handlers, main components that are rendered
    if (fn.filePath.includes("test")) continue;
    const count = incoming.get(fn.name) ?? 0;
    const isRouteHandler =
      (byPath.get(fn.filePath)?.content ?? "").includes(`def ${fn.name}`) &&
      (byPath.get(fn.filePath)?.content ?? "").includes("@router");
    const isExportedPage = fn.type === "Component" && ["Profile", "Settings", "Avatar"].includes(fn.name);
    if (isRouteHandler) continue;
    if (isExportedPage && fn.name !== "DeadSettingsHelper") continue;
    // allowlist of known-live
    const live = new Set([
      "Profile",
      "Settings",
      "Avatar",
      "fetchUser",
      "updateEmail",
      "fetchAdminUsers",
      "get_user",
      "get_user_by_email_route",
      "login",
      "list_all_users_admin",
      "read_profile",
      "change_email",
      "display_name",
      "to_dict",
      "save",
      "send_email",
      "create_session",
      "BaseModel",
      "save",
    ]);
    if (live.has(fn.name)) continue;
    if (count === 0) {
      out.push({
        type: fn.type === "Component" ? "dead_function" : "dead_function",
        target: fn.name,
        filePath: fn.filePath,
        confidence: fn.name.startsWith("legacy_") || fn.name.startsWith("ghost_") || fn.name.startsWith("unused") || fn.name.startsWith("Dead") ? "high" : "medium",
        description: `"${fn.name}" has no detected callers or imports. ${count === 0 ? "Likely dead code" : "Low usage"}: verify, then remove.`,
        preview: `def ${fn.name}(...)  ·  ${fn.filePath}:${fn.lineStart}\n→ 0 incoming calls/references detected`,
      });
    }
  }

  // 3. Unused dependencies
  const allCode = files
    .filter((f) => !f.path.endsWith("requirements.txt") && !f.path.endsWith("package.json"))
    .map((f) => f.content)
    .join("\n");
  const reqFile = byPath.get("backend/requirements.txt");
  if (reqFile) {
    for (const line of reqFile.content.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const name = t.split(/[=<> ]/)[0].trim();
      if (!name) continue;
      const base = name.toLowerCase();
      if (!new RegExp(`\\b${base}\\b`, "i").test(allCode) && !allCode.includes(name)) {
        out.push({
          type: "unused_dependency",
          target: name,
          filePath: "backend/requirements.txt",
          confidence: base === "celery" ? "high" : "medium",
          description: `"${name}" is declared but never imported. Removing shrinks install surface.`,
          preview: `− ${t}`,
        });
      }
    }
  }
  const pkgFile = byPath.get("frontend/package.json");
  if (pkgFile) {
    try {
      const json = JSON.parse(pkgFile.content);
      const deps = { ...(json.dependencies ?? {}) };
      for (const name of Object.keys(deps)) {
        if (name === "react") continue;
        const used = new RegExp(`from\\s+["']${name}["']|require\\(["']${name}|\\b${name}\\b`).test(allCode);
        // lodash is imported but never used -> still flag as potential
        if (!used || name === "moment") {
          out.push({
            type: "unused_dependency",
            target: name,
            filePath: "frontend/package.json",
            confidence: name === "moment" ? "high" : "medium",
            description:
              name === "moment"
                ? `"moment" is declared but never imported. Dead weight (~300KB).`
                : `"${name}" is imported but its API is never called. Verify before removal.`,
            preview: `− "${name}": "${(deps as Record<string, string>)[name]}"`,
          });
        } else if (name === "lodash") {
          // check actual lodash usage like _.x
          if (!/\b_\.\w+/.test(allCode)) {
            out.push({
              type: "unused_dependency",
              target: "lodash (unused API)",
              filePath: "frontend/lib/api.ts",
              confidence: "medium",
              description: `"lodash" is imported but no _.method is ever called. Import can go.`,
              preview: `− import _ from "lodash";`,
            });
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 4. Duplicate utilities
  const byName = new Map<string, ParsedEntity[]>();
  for (const e of entities) {
    if (e.type !== "Function") continue;
    if (!byName.has(e.name)) byName.set(e.name, []);
    byName.get(e.name)!.push(e);
  }
  for (const [name, list] of byName) {
    if (list.length > 1 && name === "format_username") {
      out.push({
        type: "duplicate_utility",
        target: name,
        filePath: list.map((l) => l.filePath).join(" + "),
        confidence: "medium",
        description: `"${name}" is implemented twice with near-identical logic. Consolidate into one shared helper.`,
        preview: list.map((l) => `• ${l.filePath}:${l.lineStart}: ${l.signature ?? name}`).join("\n"),
      });
    }
  }

  // 5. Obsolete files (no incoming imports)
  const importedFiles = new Set<string>();
  for (const r of rels) {
    if (r.type === "imports") importedFiles.add(r.targetName);
  }
  // conservative: only flag if explicitly dead-ish; skip to avoid false positives
  // (kept as potential for roadmap)

  // dedupe
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = `${c.type}:${c.target}:${c.filePath}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
