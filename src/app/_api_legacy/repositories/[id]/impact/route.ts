import { db } from "@/db";
import { changes, entities, relationships } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getSessionUser } from "@/lib/auth";
import { computeImpact } from "@/lib/analyzer";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const symbol = String(body.symbol ?? "").trim();
  if (!symbol) return Response.json({ error: "Symbol is required." }, { status: 400 });

  const [entityRows, relRows] = await Promise.all([
    db.select().from(entities).where(eq(entities.repositoryId, id)),
    db.select().from(relationships).where(eq(relationships.repositoryId, id)),
  ]);

  const result = computeImpact(
    symbol,
    entityRows.map((e) => ({ name: e.name, qualifiedName: e.qualifiedName, type: e.type, filePath: e.filePath })),
    relRows.map((r) => ({
      sourceName: r.sourceName,
      sourceFile: r.sourceFile,
      targetName: r.targetName,
      type: r.type,
      confidence: r.confidence,
      snippet: r.snippet,
    }))
  );

  // persist as a change context (CRUD for changes)
  let changeId: string | null = null;
  try {
    changeId = randomUUID();
    await db.insert(changes).values({
      id: changeId,
      repositoryId: id,
      filePath: result.files[0] ?? "unknown",
      symbol,
      changeType: body.changeType ?? "query",
      oldValue: symbol,
      newValue: body.newValue ?? null,
      description: `Impact query for ${symbol}: ${result.summary.files} files, ${result.summary.apis} APIs, ${result.summary.components} components, ${result.summary.tests} tests.`,
    });
  } catch {
    changeId = null;
  }

  return Response.json({ ...result, changeId, symbol });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const entityRows = await db.select().from(entities).where(eq(entities.repositoryId, id));
  // suggest symbols worth querying
  const interesting = entityRows
    .filter((e) => ["Function", "Class", "API", "Component", "Field"].includes(e.type))
    .slice(0, 60)
    .map((e) => ({ name: e.name, qualifiedName: e.qualifiedName, type: e.type, filePath: e.filePath }));
  const pinned = [
    { name: "User.email", qualifiedName: "backend/models/user.py::User.email", type: "Field", filePath: "backend/models/user.py" },
    { name: "get_user_by_email", qualifiedName: "backend/services/user_service.py::get_user_by_email", type: "Function", filePath: "backend/services/user_service.py" },
    { name: "GET /users/{user_id}", qualifiedName: "backend/api/user.py::api:GET /users/{user_id}", type: "API", filePath: "backend/api/user.py" },
  ];
  return Response.json({ suggestions: [...pinned, ...interesting].slice(0, 40) });
}
