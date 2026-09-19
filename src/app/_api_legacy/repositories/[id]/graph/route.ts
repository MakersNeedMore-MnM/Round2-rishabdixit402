import { db } from "@/db";
import { entities, relationships } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const url = new URL(req.url);
  const limit = Math.min(220, Number(url.searchParams.get("limit") ?? 120));

  const [entityRows, relRows] = await Promise.all([
    db.select().from(entities).where(eq(entities.repositoryId, id)),
    db.select().from(relationships).where(eq(relationships.repositoryId, id)),
  ]);

  // prioritize interesting entities
  const score = (t: string) =>
    t === "API" ? 0 : t === "Component" ? 1 : t === "Class" ? 2 : t === "Function" ? 3 : t === "Test" ? 4 : t === "Field" ? 5 : t === "File" ? 6 : 7;
  const sorted = [...entityRows].sort((a, b) => score(a.type) - score(b.type)).slice(0, limit);
  const keepNames = new Set(sorted.map((e) => e.name));
  keepNames.add("User.email");
  keepNames.add("User.email_address");

  const filteredRels = relRows
    .filter((r) => keepNames.has(r.sourceName) || keepNames.has(r.targetName))
    .slice(0, 260);

  return Response.json({
    entities: sorted.map((e) => ({
      id: e.id,
      name: e.name,
      qualifiedName: e.qualifiedName,
      type: e.type,
      filePath: e.filePath,
      lineStart: e.lineStart,
    })),
    relationships: filteredRels.map((r) => ({
      id: r.id,
      sourceName: r.sourceName,
      sourceFile: r.sourceFile,
      targetName: r.targetName,
      type: r.type,
      confidence: r.confidence,
      snippet: r.snippet,
    })),
    totals: { entities: entityRows.length, relationships: relRows.length },
  });
}
