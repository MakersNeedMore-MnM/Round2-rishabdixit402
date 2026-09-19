import { db } from "@/db";
import {
  analyses,
  changes,
  cleanupItems,
  entities,
  findings,
  relationships,
  repoFiles,
  repositories,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  parseFile,
  type FileInput,
  type ParsedEntity,
  type ParsedRelationship,
} from "./analyzer";
import { runRules } from "./rules";
import { runJanitor } from "./janitor";
import { DEMO_CHANGES, DEMO_FILES } from "./demo-repo";

export async function analyzeRepository(repositoryId: string): Promise<string> {
  const repoRows = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repositoryId))
    .limit(1);
  if (repoRows.length === 0) throw new Error("Repository not found");
  const repo = repoRows[0];

  await db
    .update(repositories)
    .set({ status: "analyzing", updatedAt: new Date() })
    .where(eq(repositories.id, repositoryId));

  // Load files (demo repos carry content; custom repos get scaffolded sample)
  let fileRows = await db
    .select()
    .from(repoFiles)
    .where(eq(repoFiles.repositoryId, repositoryId))
    .orderBy(asc(repoFiles.path));

  if (fileRows.length === 0) {
    // Scaffold: if demo flag, use demo files; else create a starter sample from URL name
    const seedFiles = repo.isDemo ? DEMO_FILES : scaffoldFor(repo.githubUrl, repo.name);
    for (const f of seedFiles) {
      await db.insert(repoFiles).values({
        repositoryId,
        path: f.path,
        language: f.language,
        content: f.content,
        loc: f.content.split("\n").length,
        status: "analyzed",
      });
    }
    fileRows = await db
      .select()
      .from(repoFiles)
      .where(eq(repoFiles.repositoryId, repositoryId))
      .orderBy(asc(repoFiles.path));
  }

  const inputs: FileInput[] = fileRows.map((f) => ({
    path: f.path,
    language: f.language,
    content: f.content,
  }));

  // Clear previous graph for idempotent re-analysis
  await db.delete(relationships).where(eq(relationships.repositoryId, repositoryId));
  await db.delete(entities).where(eq(entities.repositoryId, repositoryId));

  // Parse
  let allEntities: ParsedEntity[] = [];
  let allRels: ParsedRelationship[] = [];
  const langStats: Record<string, number> = {};
  for (const f of inputs) {
    langStats[f.language] = (langStats[f.language] ?? 0) + 1;
    try {
      const { entities: ents, rels } = parseFile(f);
      allEntities.push(...ents);
      allRels.push(...rels);
    } catch {
      // record file as failed but continue
      await db
        .update(repoFiles)
        .set({ status: "failed" })
        .where(eq(repoFiles.id, fileRows.find((r) => r.path === f.path)?.id ?? ""));
    }
  }

  // Persist entities
  const idByQualified = new Map<string, string>();
  const fileIdByPath = new Map(fileRows.map((r) => [r.path, r.id]));
  for (const e of allEntities) {
    idByQualified.set(e.qualifiedName, e.id);
    await db.insert(entities).values({
      id: e.id,
      repositoryId,
      fileId: fileIdByPath.get(e.filePath) ?? null,
      type: e.type,
      name: e.name,
      qualifiedName: e.qualifiedName,
      filePath: e.filePath,
      lineStart: e.lineStart,
      lineEnd: e.lineEnd,
      signature: e.signature ?? null,
      metadata: e.metadata ?? null,
    });
  }

  // Resolve relationship endpoints to entity ids where possible
  const byName = new Map<string, ParsedEntity[]>();
  for (const e of allEntities) {
    if (!byName.has(e.name)) byName.set(e.name, []);
    byName.get(e.name)!.push(e);
  }
  const resolve = (name: string, file?: string): string | null => {
    const list = byName.get(name);
    if (!list || list.length === 0) return null;
    const inFile = list.find((l) => l.filePath === file);
    return (inFile ?? list[0]).id;
  };

  for (const r of allRels) {
    await db.insert(relationships).values({
      id: randomUUID(),
      repositoryId,
      sourceId: resolve(r.sourceName, r.sourceFile),
      sourceName: r.sourceName,
      sourceFile: r.sourceFile,
      targetName: r.targetName,
      targetId: resolve(r.targetName),
      type: r.type,
      confidence: r.confidence,
      lineNo: r.lineNo ?? null,
      snippet: r.snippet ?? null,
    });
  }

  // tested_by edges: test file -> tested function
  const testEnts = allEntities.filter((e) => e.type === "Test");
  for (const t of testEnts) {
    const content = fileRows.find((f) => f.path === t.filePath)?.content ?? "";
    for (const fn of allEntities.filter((e) => e.type === "Function")) {
      if (content.includes(fn.name) && fn.name.length > 3) {
        await db.insert(relationships).values({
          id: randomUUID(),
          repositoryId,
          sourceId: fn.id,
          sourceName: fn.name,
          sourceFile: fn.filePath,
          targetName: t.name,
          targetId: t.id,
          type: "tested_by",
          confidence: "medium",
          snippet: `${t.name} references ${fn.name}`,
        });
      }
    }
  }

  // Create analysis record
  const analysisId = randomUUID();
  const totalFunctions = allEntities.filter((e) => e.type === "Function").length;
  const totalApis = allEntities.filter((e) => e.type === "API").length;
  const totalDeps = allEntities.filter((e) => e.type === "Dependency").length;
  await db.insert(analyses).values({
    id: analysisId,
    repositoryId,
    status: "completed",
    commitSha: Math.random().toString(16).slice(2, 9),
    stats: {
      files: inputs.length,
      entities: allEntities.length,
      relationships: allRels.length,
      functions: totalFunctions,
      apis: totalApis,
      dependencies: totalDeps,
    },
  });

  // Changes: seed demo changes for demo repos, else infer one sample change
  await db.delete(changes).where(eq(changes.repositoryId, repositoryId));
  const changeSeeds = repo.isDemo
    ? DEMO_CHANGES
    : [
        {
          filePath: inputs[0]?.path ?? "app/main.py",
          symbol: allEntities.find((e) => e.type === "Function")?.name ?? "main",
          changeType: "edit",
          oldValue: "v1",
          newValue: "v2",
          description: "Initial change context inferred from latest analysis.",
        },
      ];
  const changeIds: string[] = [];
  for (const c of changeSeeds) {
    const cid = randomUUID();
    changeIds.push(cid);
    await db.insert(changes).values({
      id: cid,
      analysisId,
      repositoryId,
      filePath: c.filePath,
      symbol: c.symbol,
      changeType: c.changeType,
      oldValue: c.oldValue ?? null,
      newValue: c.newValue ?? null,
      description: c.description ?? null,
    });
  }

  // Rules
  await db.delete(findings).where(eq(findings.repositoryId, repositoryId));
  const ruleOut = runRules(inputs, changeSeeds);
  for (const f of ruleOut) {
    await db.insert(findings).values({
      id: randomUUID(),
      analysisId,
      repositoryId,
      ruleId: f.ruleId,
      severity: f.severity,
      title: f.title,
      description: f.description,
      evidence: f.evidence,
      filePath: f.filePath,
      symbol: f.symbol ?? null,
      lineStart: f.lineStart ?? null,
      lineEnd: f.lineEnd ?? null,
      status: "open",
    });
  }

  // Janitor
  await db.delete(cleanupItems).where(eq(cleanupItems.repositoryId, repositoryId));
  const candidates = runJanitor(inputs, allEntities, allRels);
  for (const c of candidates) {
    await db.insert(cleanupItems).values({
      id: randomUUID(),
      analysisId,
      repositoryId,
      type: c.type,
      target: c.target,
      filePath: c.filePath,
      confidence: c.confidence,
      description: c.description,
      preview: c.preview ?? null,
      status: "pending",
    });
  }

  await db
    .update(repositories)
    .set({
      status: "ready",
      languageStats: langStats,
      totalFiles: inputs.length,
      totalFunctions,
      totalApis,
      totalDependencies: totalDeps,
      lastAnalyzedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(repositories.id, repositoryId));

  return analysisId;
}

function scaffoldFor(githubUrl: string, name: string): FileInput[] {
  const base = name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase() || "custom-app";
  void githubUrl;
  return [
    {
      path: "app/models/account.py",
      language: "python",
      content: `"""Account model for ${base}."""
from app.models.base import BaseModel


class Account(BaseModel):
    __tablename__ = "accounts"

    def display_name(self):
        return self.full_name or self.email_address

    def to_dict(self):
        return {"id": self.id, "email_address": self.email_address}
`,
    },
    {
      path: "app/services/account_service.py",
      language: "python",
      content: `"""Account service layer."""
import json  # UNUSED
from app.models.account import Account


def get_account_by_email(email_address, include_inactive=False):
    return Account.query.filter_by(email_address=email_address).first()


def get_account_profile(account_id):
    account = Account.query.get(account_id)
    return {"id": account.id, "email": account.email}


def legacy_export_accounts():
    rows = Account.query.all()
    return [r.to_dict() for r in rows]
`,
    },
    {
      path: "app/api/accounts.py",
      language: "python",
      content: `"""Accounts API."""
from fastapi import APIRouter
from app.services.account_service import get_account_profile

router = APIRouter(prefix="/accounts")


@router.get("/{account_id}")
def get_account(account_id: int):
    profile = get_account_profile(account_id)
    return profile


@router.get("/admin/all")
def list_all_accounts_admin():
    from app.models.account import Account
    return [a.to_dict() for a in Account.query.all()]
`,
    },
    {
      path: "web/components/AccountCard.tsx",
      language: "typescript",
      content: `import React, { useEffect, useState } from "react";
import axios from "axios";

export function AccountCard({ accountId }: { accountId: number }) {
  const [account, setAccount] = useState<any>(null);
  useEffect(() => {
    axios.get(\`/api/accounts/\${accountId}\`).then((r) => setAccount(r.data));
  }, [accountId]);
  if (!account) return <div>Loading…</div>;
  return (
    <div>
      <p>{account.email}</p>
      <p>{account.full_name}</p>
    </div>
  );
}

export function DeadAccountHelper() {
  return null;
}
`,
    },
    {
      path: "web/lib/api.ts",
      language: "typescript",
      content: `import axios from "axios";
import _ from "lodash";

export async function fetchAccount(id: number) {
  const res = await axios.get(\`/api/accounts/\${id}\`);
  return { ...res.data, email: res.data.email };
}

export function unusedFormatter(x: any) {
  return JSON.stringify(x);
}
`,
    },
  ];
}
