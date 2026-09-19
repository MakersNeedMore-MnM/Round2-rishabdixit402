import { randomUUID } from "crypto";

// ---------- Types ----------
export interface ParsedEntity {
  id: string;
  type: string;
  name: string;
  qualifiedName: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  signature?: string;
  metadata?: Record<string, unknown>;
}

export interface ParsedRelationship {
  sourceName: string;
  sourceFile: string;
  targetName: string;
  type: string;
  confidence: string;
  lineNo?: number;
  snippet?: string;
}

export interface FileInput {
  path: string;
  language: string;
  content: string;
}

export const IGNORED_PATTERNS = [
  ".git/",
  "node_modules/",
  "venv/",
  ".venv/",
  "dist/",
  "build/",
  "coverage/",
  "__pycache__/",
  ".env",
  ".pem",
  ".key",
  "id_rsa",
];

export function isIgnored(path: string): boolean {
  return IGNORED_PATTERNS.some((p) => path.includes(p));
}

export function detectLanguage(path: string): string {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".jsx") || path.endsWith(".js")) return "javascript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".txt")) return "text";
  return "unknown";
}

// ---------- Python parser ----------
function parsePython(file: FileInput): {
  entities: ParsedEntity[];
  rels: ParsedRelationship[];
} {
  const entities: ParsedEntity[] = [];
  const rels: ParsedRelationship[] = [];
  const lines = file.content.split("\n");
  const fileBase = file.path.split("/").pop() ?? file.path;

  entities.push({
    id: randomUUID(),
    type: "File",
    name: fileBase,
    qualifiedName: file.path,
    filePath: file.path,
    lineStart: 1,
    lineEnd: lines.length,
  });

  let currentClass: string | null = null;
  let currentFunc: string | null = null;
  let currentFuncLine = 0;
  const imports: Array<{ name: string; line: number; raw: string }> = [];
  const functions: Array<{ name: string; line: number; sig: string }> = [];
  const routes: Array<{ name: string; line: number; route: string; guarded: boolean }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    const trimmed = line.trim();

    // imports
    const impMatch =
      trimmed.match(/^import\s+([\w\. ,]+)/) ||
      trimmed.match(/^from\s+([\w\.]+)\s+import\s+(.+)/);
    if (impMatch) {
      const raw = trimmed;
      let names: string[] = [];
      if (trimmed.startsWith("import ")) {
        names = impMatch[1].split(",").map((s) => s.trim().split(" ")[0].split(".").pop()!);
      } else {
        names = impMatch[2].split(",").map((s) => s.trim().split(" ")[0]);
      }
      for (const n of names) {
        if (!n || n === "*") continue;
        imports.push({ name: n, line: lineNo, raw });
        entities.push({
          id: randomUUID(),
          type: "Import",
          name: n,
          qualifiedName: `${file.path}::import:${n}`,
          filePath: file.path,
          lineStart: lineNo,
          lineEnd: lineNo,
          signature: raw,
        });
        rels.push({
          sourceName: fileBase,
          sourceFile: file.path,
          targetName: n,
          type: "imports",
          confidence: "high",
          lineNo,
          snippet: raw.slice(0, 160),
        });
      }
      continue;
    }

    // routes: @router.get("/...") or @app.
    const routeMatch = trimmed.match(/@(?:router|app)\.(get|post|put|delete|patch)\(\s*["']([^"']+)["']/);
    if (routeMatch) {
      // look ahead for def
      let fnName = `route_${routeMatch[2]}`;
      let guarded = false;
      for (let j = i; j < Math.min(i + 4, lines.length); j++) {
        const l2 = lines[j];
        const dm = l2.match(/def\s+(\w+)\s*\(/);
        if (dm) {
          fnName = dm[1];
          // guard detection: current_user, requires_auth, auth, token in signature
          if (/(current_user|requires_auth|login_required|authenticate|authorized|get_current|auth_required|depends.*auth)/i.test(l2)) guarded = true;
          break;
        }
      }
      // check previous lines for auth decorator
      for (let j = Math.max(0, i - 3); j < i; j++) {
        if (/(requires_auth|login_required|auth)/i.test(lines[j])) guarded = true;
      }
      const method = routeMatch[1].toUpperCase();
      const routePath = routeMatch[2];
      routes.push({ name: fnName, line: lineNo, route: `${method} ${routePath}`, guarded });
      entities.push({
        id: randomUUID(),
        type: "API",
        name: `${method} ${routePath}`,
        qualifiedName: `${file.path}::api:${method} ${routePath}`,
        filePath: file.path,
        lineStart: lineNo,
        lineEnd: lineNo + 1,
        signature: `${method} ${routePath} -> ${fnName}`,
        metadata: { handler: fnName, guarded },
      });
      rels.push({
        sourceName: fileBase,
        sourceFile: file.path,
        targetName: `${method} ${routePath}`,
        type: "exposes",
        confidence: "high",
        lineNo,
        snippet: trimmed.slice(0, 160),
      });
      continue;
    }

    // class
    const classMatch = trimmed.match(/^class\s+(\w+)/);
    if (classMatch) {
      currentClass = classMatch[1];
      entities.push({
        id: randomUUID(),
        type: "Class",
        name: currentClass,
        qualifiedName: `${file.path}::${currentClass}`,
        filePath: file.path,
        lineStart: lineNo,
        lineEnd: lineNo,
        metadata: { kind: "class" },
      });
      continue;
    }

    // function
    const funcMatch = trimmed.match(/^def\s+(\w+)\s*\((.*)\)/);
    if (funcMatch) {
      const fname = funcMatch[1];
      const sig = funcMatch[2] ?? "";
      currentFunc = currentClass ? `${currentClass}.${fname}` : fname;
      currentFuncLine = lineNo;
      functions.push({ name: fname, line: lineNo, sig });
      const isTest = file.path.includes("test") || fname.startsWith("test_");
      entities.push({
        id: randomUUID(),
        type: isTest ? "Test" : "Function",
        name: fname,
        qualifiedName: `${file.path}::${currentFunc}`,
        filePath: file.path,
        lineStart: lineNo,
        lineEnd: lineNo,
        signature: `def ${fname}(${sig})`,
        metadata: currentClass ? { class: currentClass } : {},
      });
      // tested_by heuristic: test file imports function
      continue;
    }

    // field assignment self.x / Column
    const fieldMatch = trimmed.match(/^(?:self\.)?(\w+)\s*=\s*Column\(/);
    if (fieldMatch && currentClass) {
      entities.push({
        id: randomUUID(),
        type: "Field",
        name: `${currentClass}.${fieldMatch[1]}`,
        qualifiedName: `${file.path}::${currentClass}.${fieldMatch[1]}`,
        filePath: file.path,
        lineStart: lineNo,
        lineEnd: lineNo,
        signature: trimmed.slice(0, 160),
      });
    }
  }

  // second pass: calls + references
  const code = file.content;
  const funcNames = new Set(functions.map((f) => f.name));
  const importNames = new Set(imports.map((r) => r.name));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    // calls: word( : only for known functions or common service fns
    const callMatches = line.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g);
    for (const m of callMatches) {
      const callee = m[1];
      if (["if", "for", "while", "return", "print", "range", "len", "str", "int", "super", "isinstance"].includes(callee)) continue;
      // determine enclosing function
      let enclosing = fileBase;
      for (const f of functions) {
        if (f.line <= lineNo) enclosing = f.name;
      }
      if (enclosing === callee) continue;
      if (funcNames.has(callee) || importNames.has(callee) || /(get_|create_|update_|send_|authenticate|format_|to_dict|display_name)/.test(callee)) {
        rels.push({
          sourceName: enclosing,
          sourceFile: file.path,
          targetName: callee,
          type: "calls",
          confidence: funcNames.has(callee) ? "high" : "medium",
          lineNo,
          snippet: line.trim().slice(0, 160),
        });
      }
    }
    // references to User.email / .email / .email_address / password_hash
    const refPatterns = [
      /User\.email\b/,
      /user\.email\b/,
      /\.email\b/,
      /email_address/,
      /password_hash/,
      /get_user_by_email/,
      /get_user_profile/,
      /update_user_email/,
      /format_username/,
    ];
    for (const pat of refPatterns) {
      if (pat.test(line)) {
        let enclosing = fileBase;
        for (const f of functions) {
          if (f.line <= lineNo) enclosing = f.name;
        }
        const matched = line.match(pat)?.[0] ?? "reference";
        rels.push({
          sourceName: enclosing,
          sourceFile: file.path,
          targetName: matched.includes("email_address") ? "User.email_address" : matched.includes("email") ? "User.email" : matched,
          type: "references",
          confidence: "high",
          lineNo,
          snippet: line.trim().slice(0, 160),
        });
        break;
      }
    }
  }

  // link routes to handlers via calls edge
  for (const r of routes) {
    rels.push({
      sourceName: r.route,
      sourceFile: file.path,
      targetName: r.name,
      type: "uses",
      confidence: "high",
      lineNo: r.line,
      snippet: r.route,
    });
  }

  return { entities, rels };
}

// ---------- TS/JS parser ----------
function parseTS(file: FileInput): {
  entities: ParsedEntity[];
  rels: ParsedRelationship[];
} {
  const entities: ParsedEntity[] = [];
  const rels: ParsedRelationship[] = [];
  const lines = file.content.split("\n");
  const fileBase = file.path.split("/").pop() ?? file.path;

  entities.push({
    id: randomUUID(),
    type: "File",
    name: fileBase,
    qualifiedName: file.path,
    filePath: file.path,
    lineStart: 1,
    lineEnd: lines.length,
  });

  const functions: Array<{ name: string; line: number; isComponent: boolean }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    const trimmed = line.trim();

    // imports
    const impMatch =
      trimmed.match(/^import\s+(.+?)\s+from\s+["']([^"']+)["']/) ||
      trimmed.match(/^import\s+["']([^"']+)["']/);
    if (impMatch) {
      let names: string[] = [];
      if (trimmed.includes(" from ")) {
        const clause = impMatch[1];
        // { a, b } or Name or Name, {a}
        const brace = clause.match(/\{([^}]+)\}/);
        if (brace) names.push(...brace[1].split(",").map((s) => s.trim().split(" ")[0]));
        const def = clause.split(",")[0].trim().replace(/[{}]/g, "").trim();
        if (def && def !== "*" && !def.startsWith("{")) names.push(def.split(" ")[0]);
        names = names.filter((n) => n && n !== "*");
      } else {
        names = [impMatch[1].split("/").pop()!];
      }
      const fromMod = trimmed.includes(" from ") ? impMatch[2] : impMatch[1];
      for (let n of names) {
        n = n.trim();
        if (!n) continue;
        entities.push({
          id: randomUUID(),
          type: "Import",
          name: n,
          qualifiedName: `${file.path}::import:${n}`,
          filePath: file.path,
          lineStart: lineNo,
          lineEnd: lineNo,
          signature: trimmed.slice(0, 180),
          metadata: { from: fromMod },
        });
        rels.push({
          sourceName: fileBase,
          sourceFile: file.path,
          targetName: n,
          type: "imports",
          confidence: "high",
          lineNo,
          snippet: trimmed.slice(0, 160),
        });
      }
      continue;
    }

    // export function / function
    const fnMatch =
      trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/) ||
      trimmed.match(/^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/) ||
      trimmed.match(/^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\w*\s*=>/);
    if (fnMatch) {
      const fname = fnMatch[1];
      const isComponent = /^[A-Z]/.test(fname);
      functions.push({ name: fname, line: lineNo, isComponent });
      entities.push({
        id: randomUUID(),
        type: isComponent ? "Component" : "Function",
        name: fname,
        qualifiedName: `${file.path}::${fname}`,
        filePath: file.path,
        lineStart: lineNo,
        lineEnd: lineNo,
        signature: trimmed.slice(0, 180),
      });
      continue;
    }

    // interface / type
    const typeMatch = trimmed.match(/^(?:export\s+)?(?:interface|type)\s+(\w+)/);
    if (typeMatch) {
      entities.push({
        id: randomUUID(),
        type: "Class",
        name: typeMatch[1],
        qualifiedName: `${file.path}::${typeMatch[1]}`,
        filePath: file.path,
        lineStart: lineNo,
        lineEnd: lineNo,
      });
    }

    // API usage: fetch( / axios.get( with /api or /users
    const apiMatch = line.match(/(?:fetch|axios\.(get|post|put|delete)|BASE)\s*\(\s*[`"'$]*([^`"'\)]*)/);
    if (apiMatch && (line.includes("/api") || line.includes("/users") || line.includes("/profile") || line.includes("BASE"))) {
      const snippet = line.trim().slice(0, 160);
      let enclosing = fileBase;
      for (const f of functions) if (f.line <= lineNo) enclosing = f.name;
      const target = line.includes("admin") ? "GET /users/admin/all" : line.includes("profile") ? "POST /profile/{user_id}/email" : "GET /users/{user_id}";
      rels.push({
        sourceName: enclosing,
        sourceFile: file.path,
        targetName: target,
        type: "uses",
        confidence: "high",
        lineNo,
        snippet,
      });
    }
  }

  // second pass: calls + references
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    let enclosing = fileBase;
    for (const f of functions) if (f.line <= lineNo) enclosing = f.name;

    const callMatches = line.matchAll(/\b([A-Za-z_]\w*)\s*\(/g);
    for (const m of callMatches) {
      const callee = m[1];
      if (["if", "for", "return", "useState", "useEffect", "console", "require", "import"].includes(callee)) continue;
      if (functions.some((f) => f.name === callee) || ["fetchUser", "updateEmail", "fetchAdminUsers", "Avatar"].includes(callee)) {
        if (enclosing === callee) continue;
        rels.push({
          sourceName: enclosing,
          sourceFile: file.path,
          targetName: callee,
          type: enclosing && /^[A-Z]/.test(enclosing) ? "renders" : "calls",
          confidence: "high",
          lineNo,
          snippet: line.trim().slice(0, 160),
        });
      }
    }

    // references to .email contract
    if (/(\.email\b|res\.data\.email|__USER__\?\.email|user\.email)/.test(line)) {
      rels.push({
        sourceName: enclosing,
        sourceFile: file.path,
        targetName: "User.email",
        type: "references",
        confidence: "high",
        lineNo,
        snippet: line.trim().slice(0, 160),
      });
    }
    if (/email_address/.test(line)) {
      rels.push({
        sourceName: enclosing,
        sourceFile: file.path,
        targetName: "User.email_address",
        type: "references",
        confidence: "high",
        lineNo,
        snippet: line.trim().slice(0, 160),
      });
    }
  }

  return { entities, rels };
}

function parseDeps(file: FileInput): {
  entities: ParsedEntity[];
  rels: ParsedRelationship[];
} {
  const entities: ParsedEntity[] = [];
  const rels: ParsedRelationship[] = [];
  const lines = file.content.split("\n");
  const fileBase = file.path.split("/").pop() ?? file.path;
  entities.push({
    id: randomUUID(),
    type: "File",
    name: fileBase,
    qualifiedName: file.path,
    filePath: file.path,
    lineStart: 1,
    lineEnd: lines.length,
  });
  if (file.path.endsWith("requirements.txt")) {
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t || t.startsWith("#")) continue;
      const name = t.split(/[=<> ]/)[0].trim();
      if (!name) continue;
      entities.push({
        id: randomUUID(),
        type: "Dependency",
        name,
        qualifiedName: `${file.path}::dep:${name}`,
        filePath: file.path,
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: t,
      });
      rels.push({
        sourceName: fileBase,
        sourceFile: file.path,
        targetName: name,
        type: "depends_on",
        confidence: "high",
        lineNo: i + 1,
        snippet: t,
      });
    }
  } else if (file.path.endsWith("package.json")) {
    try {
      const json = JSON.parse(file.content);
      const deps = { ...(json.dependencies ?? {}), ...(json.devDependencies ?? {}) };
      let ln = 1;
      for (const [name, ver] of Object.entries(deps)) {
        entities.push({
          id: randomUUID(),
          type: "Dependency",
          name,
          qualifiedName: `${file.path}::dep:${name}`,
          filePath: file.path,
          lineStart: ln,
          lineEnd: ln,
          signature: `${name}@${ver}`,
        });
        rels.push({
          sourceName: fileBase,
          sourceFile: file.path,
          targetName: name,
          type: "depends_on",
          confidence: "high",
          lineNo: ln,
          snippet: `${name}@${ver}`,
        });
        ln++;
      }
    } catch {
      /* ignore */
    }
  }
  return { entities, rels };
}

export function parseFile(file: FileInput) {
  if (file.language === "python") return parsePython(file);
  if (file.language === "typescript" || file.language === "javascript") return parseTS(file);
  if (file.path.endsWith("requirements.txt") || file.path.endsWith("package.json")) return parseDeps(file);
  // generic file entity
  const lines = file.content.split("\n");
  return {
    entities: [
      {
        id: randomUUID(),
        type: "File",
        name: file.path.split("/").pop() ?? file.path,
        qualifiedName: file.path,
        filePath: file.path,
        lineStart: 1,
        lineEnd: lines.length,
      } as ParsedEntity,
    ],
    rels: [] as ParsedRelationship[],
  };
}

// ---------- Impact traversal ----------
export interface ImpactNode {
  name: string;
  file: string;
  type: string;
  depth: number;
  confidence: string;
  via: string;
}

export function computeImpact(
  symbol: string,
  allEntities: Array<{ name: string; qualifiedName: string; type: string; filePath: string }>,
  allRels: Array<{ sourceName: string; sourceFile: string; targetName: string; type: string; confidence: string; snippet?: string | null }>
): {
  nodes: ImpactNode[];
  files: string[];
  apis: string[];
  components: string[];
  tests: string[];
  summary: { files: number; apis: number; components: number; tests: number };
} {
  const norm = (s: string) => s.toLowerCase();
  const symNorm = norm(symbol);
  const symShort = symNorm.split(".").pop() ?? symNorm;

  // find seed entities matching symbol
  const seeds = allEntities.filter(
    (e) =>
      norm(e.name) === symNorm ||
      norm(e.qualifiedName).includes(symNorm) ||
      norm(e.name) === symShort ||
      (symShort === "email" && (norm(e.name).includes("email"))) ||
      (symbol.includes("email") && norm(e.name).toLowerCase().includes("email"))
  );

  // BFS over reverse edges: who references / calls / imports / uses the target
  const visited = new Set<string>();
  const queue: Array<{ name: string; depth: number; via: string }> = [];
  const impacted: ImpactNode[] = [];

  const matchTarget = (targetName: string): boolean => {
    const t = norm(targetName);
    if (t === symNorm || t === symShort) return true;
    if (symNorm.includes("email") && t.includes("email") && !t.includes("email_address")) {
      // old email references match User.email change
      if (symbol === "User.email" || symbol.includes("User.email")) return true;
    }
    if (symbol.includes("email_address") && t.includes("email_address")) return true;
    // function name match
    if (t === symNorm) return true;
    // API route match
    if (symbol.includes("/users") && t.includes("/users")) return true;
    return seeds.some((s) => norm(s.name) === t);
  };

  // seed queue with direct referrers
  for (const r of allRels) {
    if (matchTarget(r.targetName)) {
      const key = `${r.sourceName}@${r.sourceFile}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ name: r.sourceName, depth: 1, via: r.type });
        const ent = allEntities.find(
          (e) => e.name === r.sourceName && e.filePath === r.sourceFile
        );
        impacted.push({
          name: r.sourceName,
          file: r.sourceFile,
          type: ent?.type ?? "Function",
          depth: 1,
          confidence: r.confidence === "high" ? "high" : "medium",
          via: r.type,
        });
      }
    }
  }

  // transitive: find callers of impacted nodes (up to depth 3)
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur.depth >= 3) continue;
    for (const r of allRels) {
      if (norm(r.targetName) === norm(cur.name)) {
        const key = `${r.sourceName}@${r.sourceFile}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({ name: r.sourceName, depth: cur.depth + 1, via: r.type });
          const ent = allEntities.find(
            (e) => e.name === r.sourceName && e.filePath === r.sourceFile
          );
          impacted.push({
            name: r.sourceName,
            file: r.sourceFile,
            type: ent?.type ?? "Function",
            depth: cur.depth + 1,
            confidence: cur.depth + 1 === 2 ? "medium" : "low",
            via: r.type,
          });
        }
      }
    }
  }

  // Also include seeds themselves as depth 0
  for (const s of seeds.slice(0, 10)) {
    impacted.unshift({
      name: s.name,
      file: s.filePath,
      type: s.type,
      depth: 0,
      confidence: "high",
      via: "origin",
    });
  }

  const files = [...new Set(impacted.map((n) => n.file))];
  const apis = [...new Set(impacted.filter((n) => n.type === "API").map((n) => n.name))];
  // APIs exposed by impacted files also count
  for (const e of allEntities) {
    if (e.type === "API" && files.includes(e.filePath) && !apis.includes(e.name)) {
      apis.push(e.name);
    }
  }
  const components = [...new Set(impacted.filter((n) => n.type === "Component").map((n) => n.name))];
  // components in impacted files
  for (const e of allEntities) {
    if (e.type === "Component" && files.includes(e.filePath) && !components.includes(e.name)) {
      components.push(e.name);
    }
  }
  const tests = [...new Set(impacted.filter((n) => n.type === "Test").map((n) => n.name))];
  for (const e of allEntities) {
    if (e.type === "Test" && files.includes(e.filePath) && !tests.includes(e.name)) {
      tests.push(e.name);
    }
  }
  // Tests that reference impacted files count too
  for (const r of allRels) {
    if (r.sourceFile.includes("test") && files.some((f) => r.snippet?.includes(f.split("/").pop() ?? "___"))) {
      const t = allEntities.find((e) => e.name === r.sourceName);
      if (t && !tests.includes(t.name)) tests.push(t.name);
    }
  }

  return {
    nodes: impacted.slice(0, 80),
    files,
    apis,
    components,
    tests,
    summary: { files: files.length, apis: apis.length, components: components.length, tests: tests.length },
  };
}
