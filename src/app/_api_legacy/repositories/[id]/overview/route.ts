import { db } from "@/db";
import { analyses, changes, cleanupItems, entities, findings, relationships, repositories, repoFiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const repoRows = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1);
  if (repoRows.length === 0) return Response.json({ error: "Not found" }, { status: 404 });

  const [fileRows, entityRows, relRows, findingRows, cleanupRows, changeRows, analysisRows] = await Promise.all([
    db.select().from(repoFiles).where(eq(repoFiles.repositoryId, id)),
    db.select().from(entities).where(eq(entities.repositoryId, id)),
    db.select().from(relationships).where(eq(relationships.repositoryId, id)),
    db.select().from(findings).where(eq(findings.repositoryId, id)).orderBy(desc(findings.createdAt)),
    db.select().from(cleanupItems).where(eq(cleanupItems.repositoryId, id)).orderBy(desc(cleanupItems.createdAt)),
    db.select().from(changes).where(eq(changes.repositoryId, id)).orderBy(desc(changes.createdAt)),
    db.select().from(analyses).where(eq(analyses.repositoryId, id)).orderBy(desc(analyses.createdAt)).limit(5),
  ]);

  const byType: Record<string, number> = {};
  for (const e of entityRows) byType[e.type] = (byType[e.type] ?? 0) + 1;
  const bySeverity: Record<string, number> = { high: 0, medium: 0, low: 0, passed: 0 };
  for (const f of findingRows) {
    if (f.status === "dismissed") continue;
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
  }
  const byCleanup: Record<string, number> = {};
  for (const c of cleanupRows) {
    if (c.status === "dismissed") continue;
    byCleanup[c.type] = (byCleanup[c.type] ?? 0) + 1;
  }

  // health score: 100 - weighted penalties
  const open = findingRows.filter((f) => f.status === "open");
  const penalty = open.reduce((acc, f) => acc + (f.severity === "high" ? 12 : f.severity === "medium" ? 5 : 2), 0);
  const cleanupPenalty = cleanupRows.filter((c) => c.status === "pending").length * 1.5;
  const health = Math.max(8, Math.min(100, Math.round(100 - penalty - cleanupPenalty)));

  return Response.json({
    repository: repoRows[0],
    stats: {
      files: fileRows.length,
      entities: entityRows.length,
      relationships: relRows.length,
      byType,
      bySeverity,
      byCleanup,
      health,
      openFindings: open.length,
      pendingCleanup: cleanupRows.filter((c) => c.status === "pending").length,
    },
    analyses: analysisRows,
    changes: changeRows,
    recentFindings: findingRows.slice(0, 6),
    recentCleanup: cleanupRows.slice(0, 6),
    files: fileRows.map((f) => ({ id: f.id, path: f.path, language: f.language, loc: f.loc, status: f.status })),
  });
}
