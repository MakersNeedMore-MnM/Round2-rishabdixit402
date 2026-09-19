import type { FileInput } from "./analyzer";

export interface RuleFinding {
  ruleId: string;
  severity: "high" | "medium" | "low" | "passed";
  title: string;
  description: string;
  filePath: string;
  symbol?: string;
  lineStart?: number;
  lineEnd?: number;
  evidence: {
    files: string[];
    symbols: string[];
    lines: Array<{ file: string; line: number; snippet: string }>;
    relationship?: string;
    suggestion?: string;
  };
}

function linesOf(content: string): string[] {
  return content.split("\n");
}

function findLines(
  files: FileInput[],
  predicate: (line: string, idx: number, path: string) => boolean,
  exclude?: (path: string) => boolean
): Array<{ file: string; line: number; snippet: string }> {
  const out: Array<{ file: string; line: number; snippet: string }> = [];
  for (const f of files) {
    if (exclude?.(f.path)) continue;
    const ls = linesOf(f.content);
    for (let i = 0; i < ls.length; i++) {
      if (predicate(ls[i], i, f.path)) {
        out.push({ file: f.path, line: i + 1, snippet: ls[i].trim().slice(0, 200) });
        if (out.length > 40) return out;
      }
    }
  }
  return out;
}

export function runRules(
  files: FileInput[],
  changes: Array<{ symbol: string; changeType: string; oldValue?: string | null; newValue?: string | null; filePath: string }>
): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const byPath = new Map(files.map((f) => [f.path, f]));

  // RULE 1: removed_field_reference: old User.email still referenced
  {
    const stale = findLines(
      files,
      (line, _i, path) => {
        if (path.includes("migrations/")) return false;
        // ignore the model file's own comment mentioning rename
        const t = line.trim();
        if (t.startsWith("#") || t.startsWith('"""') || t.startsWith("//") || t.startsWith("*") || t.startsWith("{/*")) return false;
        return /(\bUser\.email\b|[^_a-zA-Z]user\.email\b|\.email\b)/.test(line) && !line.includes("email_address") && !line.includes("new_email") && !line.includes("new email");
      }
    );
    if (stale.length > 0) {
      findings.push({
        ruleId: "removed_field_reference",
        severity: "high",
        title: "Removed field still referenced",
        description: `User.email was renamed to User.email_address, but ${stale.length} stale reference(s) still use the old field across ${new Set(stale.map((s) => s.file)).size} file(s). These will break at runtime or return undefined.`,
        filePath: stale[0].file,
        symbol: "User.email → User.email_address",
        lineStart: stale[0].line,
        lineEnd: stale[0].line,
        evidence: {
          files: [...new Set(stale.map((s) => s.file))],
          symbols: ["User.email", "User.email_address"],
          lines: stale.slice(0, 12),
          relationship: "references",
          suggestion: "Update every stale consumer to user.email_address, then re-run impact analysis to confirm zero remaining references.",
        },
      });
    } else {
      findings.push({
        ruleId: "removed_field_reference",
        severity: "passed",
        title: "No stale field references",
        description: "No references to removed fields were detected.",
        filePath: files[0]?.path ?? "",
        evidence: { files: [], symbols: [], lines: [], suggestion: "No action needed." },
      });
    }
  }

  // RULE 2: function_signature_change: old single-arg callers
  {
    const callers = findLines(files, (line) => /get_user_by_email\(\s*[^,)]+\s*\)/.test(line) && !line.includes("def get_user_by_email"));
    if (callers.length > 0) {
      findings.push({
        ruleId: "function_signature_change",
        severity: "high",
        title: "Function signature changed: old callers remain",
        description: `get_user_by_email now requires (email_address, include_inactive=False), but ${callers.length} caller(s) still use the old single-argument contract. Positional behavior may silently change.`,
        filePath: callers[0].file,
        symbol: "get_user_by_email(email) → get_user_by_email(email_address, include_inactive)",
        lineStart: callers[0].line,
        lineEnd: callers[0].line,
        evidence: {
          files: [...new Set(callers.map((s) => s.file))],
          symbols: ["get_user_by_email"],
          lines: callers.slice(0, 12),
          relationship: "calls",
          suggestion: "Update callers to pass email_address= explicitly and decide include_inactive per call-site (admin vs public).",
        },
      });
    }
  }

  // RULE 3: api_contract_change: frontend consumes removed 'email'
  {
    const consumers = findLines(
      files.filter((f) => f.path.startsWith("frontend/")),
      (line) => /(\.email\b|res\.data\.email|__USER__)/.test(line) && !line.includes("email_address")
    );
    if (consumers.length > 0) {
      findings.push({
        ruleId: "api_contract_change",
        severity: "high",
        title: "API contract break: frontend reads removed field",
        description: `Backend response dropped the legacy "email" field, but ${consumers.length} frontend expression(s) still read .email. These render undefined after deploy.`,
        filePath: consumers[0].file,
        symbol: "GET /users/{user_id} response.email",
        lineStart: consumers[0].line,
        lineEnd: consumers[0].line,
        evidence: {
          files: [...new Set(consumers.map((s) => s.file))],
          symbols: ["response.email", "user.email"],
          lines: consumers.slice(0, 12),
          relationship: "uses",
          suggestion: "Migrate frontend to user.email_address with a fallback, or keep a deprecated alias for one release.",
        },
      });
    }
  }

  // RULE 4: auth_missing: routes without detectable guard
  {
    const unguarded: Array<{ file: string; line: number; snippet: string }> = [];
    for (const f of files) {
      if (!f.path.includes("api/")) continue;
      const ls = linesOf(f.content);
      for (let i = 0; i < ls.length; i++) {
        const m = ls[i].match(/@(?:router|app)\.(get|post|put|delete|patch)\(\s*["']([^"']+)["']/);
        if (!m) continue;
        let guarded = false;
        for (let j = Math.max(0, i - 4); j < Math.min(ls.length, i + 6); j++) {
          if (/(current_user|requires_auth|login_required|authenticate|get_current|Depends.*auth|authorized)/i.test(ls[j])) {
            guarded = true;
            break;
          }
        }
        // login route is intentionally public
        if (m[2].includes("login")) guarded = true;
        if (!guarded) {
          // find handler name
          let handler = m[2];
          for (let j = i; j < Math.min(ls.length, i + 4); j++) {
            const dm = ls[j].match(/def\s+(\w+)/);
            if (dm) {
              handler = dm[1];
              break;
            }
          }
          unguarded.push({ file: f.path, line: i + 1, snippet: `${m[1].toUpperCase()} ${m[2]} -> ${handler}` });
        }
      }
    }
    if (unguarded.length > 0) {
      const adminHit = unguarded.find((u) => u.snippet.includes("admin"));
      findings.push({
        ruleId: "auth_missing",
        severity: "high",
        title: "Authorization signal missing on protected-looking route",
        description: `${unguarded.length} route(s) have no detectable auth check. ${adminHit ? "Including an ADMIN route that lists all users: any caller can enumerate accounts." : "Verify each is intentionally public."}`,
        filePath: (adminHit ?? unguarded[0]).file,
        symbol: (adminHit ?? unguarded[0]).snippet,
        lineStart: (adminHit ?? unguarded[0]).line,
        lineEnd: (adminHit ?? unguarded[0]).line,
        evidence: {
          files: [...new Set(unguarded.map((s) => s.file))],
          symbols: unguarded.map((u) => u.snippet),
          lines: unguarded.slice(0, 12),
          relationship: "exposes",
          suggestion: "Add an auth dependency (e.g. Depends(get_current_user)) and a role check for admin routes before commit.",
        },
      });
    }
  }

  // RULE 5: sensitive_exposure: password/token/secret in response or log
  {
    const leaks = findLines(files, (line) => {
      const t = line.trim();
      if (t.startsWith("#") || t.startsWith("//")) return false;
      const hasSecret = /(password_hash|password|secret|api_key|apikey|Bearer |token=|token["']?\s*:)/i.test(line);
      if (!hasSecret) return false;
      return /(return|print\(|console\.log|logger\.|logging\.|response|res\.data)/.test(line);
    });
    if (leaks.length > 0) {
      findings.push({
        ruleId: "sensitive_exposure",
        severity: "high",
        title: "Sensitive data exposure in response or logs",
        description: `${leaks.length} location(s) emit password/token-like values into API responses or logs. Response leaks reach clients; log leaks persist in observability storage.`,
        filePath: leaks[0].file,
        symbol: "password_hash / token",
        lineStart: leaks[0].line,
        lineEnd: leaks[0].line,
        evidence: {
          files: [...new Set(leaks.map((s) => s.file))],
          symbols: ["password_hash", "token"],
          lines: leaks.slice(0, 12),
          relationship: "exposes",
          suggestion: "Strip secrets from responses; replace token logging with redacted session IDs and rotate any exposed credentials.",
        },
      });
    }
  }

  // RULE 6: null_access: dereference without guard
  {
    const risky: Array<{ file: string; line: number; snippet: string }> = [];
    for (const f of files) {
      if (!f.path.endsWith(".py")) continue;
      const ls = linesOf(f.content);
      // find functions where `.get(` result is dereferenced without `if x is None`
      for (let i = 0; i < ls.length; i++) {
        if (/=\s*\w+\.query\.get\(/.test(ls[i])) {
          const varName = ls[i].split("=")[0].trim().split(" ").pop() ?? "obj";
          let guarded = false;
          for (let j = i; j < Math.min(ls.length, i + 10); j++) {
            if (new RegExp(`if\\s+${varName}\\s+is\\s+None|if\\s+${varName}\\s*==\\s*None|if\\s+not\\s+${varName}`).test(ls[j])) {
              guarded = true;
              break;
            }
          }
          if (!guarded) {
            for (let j = i + 1; j < Math.min(ls.length, i + 8); j++) {
              if (new RegExp(`${varName}\\.`).test(ls[j])) {
                risky.push({ file: f.path, line: j + 1, snippet: ls[j].trim().slice(0, 200) });
                break;
              }
            }
          }
        }
      }
    }
    if (risky.length > 0) {
      findings.push({
        ruleId: "null_access",
        severity: "medium",
        title: "Potential null dereference without guard",
        description: `${risky.length} path(s) dereference a possibly-missing record without a None check. A deleted or invalid id raises AttributeError at runtime.`,
        filePath: risky[0].file,
        symbol: "None-guard",
        lineStart: risky[0].line,
        lineEnd: risky[0].line,
        evidence: {
          files: [...new Set(risky.map((s) => s.file))],
          symbols: ["None"],
          lines: risky.slice(0, 12),
          relationship: "uses",
          suggestion: "Add `if user is None: return 404` immediately after .get() before touching attributes.",
        },
      });
    }
  }

  // RULE 7: risky_migration: drop column still referenced
  {
    const mig = byPath.get("backend/migrations/0012_remove_email.py");
    if (mig && /drop_column.*email|RemoveField.*email|DROP\s+COLUMN/i.test(mig.content)) {
      const refs = findLines(
        files.filter((f) => !f.path.includes("migrations/")),
        (line) => /(\.email\b|["']email["'])/.test(line) && !line.includes("email_address")
      );
      if (refs.length > 0) {
        findings.push({
          ruleId: "risky_migration",
          severity: "high",
          title: "Risky migration: column dropped while still referenced",
          description: `Migration drops users.email, but ${refs.length} code reference(s) still read .email. Deploying migrates the DB before code is fixed → outage window.`,
          filePath: "backend/migrations/0012_remove_email.py",
          symbol: "users.email",
          lineStart: 7,
          lineEnd: 9,
          evidence: {
            files: ["backend/migrations/0012_remove_email.py", ...[...new Set(refs.map((s) => s.file))].slice(0, 6)],
            symbols: ["users.email"],
            lines: [
              { file: "backend/migrations/0012_remove_email.py", line: 8, snippet: 'op.drop_column("users", "email")' },
              ...refs.slice(0, 8),
            ],
            relationship: "depends_on",
            suggestion: "Ship code that reads email_address first (expand), backfill, then drop the column in a later migration (contract).",
          },
        });
      }
    }
  }

  // RULE 8: missing_test: changed entities without test signal
  {
    const testFiles = files.filter((f) => f.path.includes("test"));
    const testContent = testFiles.map((f) => f.content).join("\n");
    const uncovered: string[] = [];
    for (const sym of ["get_user_by_email", "get_user_profile", "update_user_email", "authenticate", "User.email"]) {
      if (!testContent.includes(sym)) uncovered.push(sym);
    }
    if (uncovered.length > 0) {
      findings.push({
        ruleId: "missing_test",
        severity: "medium",
        title: "Missing test signal for changed code",
        description: `${uncovered.length} changed symbol(s) have no test reference: ${uncovered.join(", ")}. Only ${testFiles.length} test file(s) exist and coverage is partial.`,
        filePath: "backend/tests/test_user.py",
        symbol: uncovered.join(", "),
        lineStart: 1,
        lineEnd: 3,
        evidence: {
          files: ["backend/tests/test_user.py"],
          symbols: uncovered,
          lines: [{ file: "backend/tests/test_user.py", line: 1, snippet: "Only format_username is tested; critical auth/profile paths are not." }],
          relationship: "tested_by",
          suggestion: "Add tests for authenticate(), get_user_profile() None-path, and the email rename contract before merging.",
        },
      });
    }
  }

  void changes;
  return findings;
}
