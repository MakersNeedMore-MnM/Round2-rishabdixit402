import { db } from "@/db";
import { changes } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const rows = await db.select().from(changes).where(eq(changes.repositoryId, id)).orderBy(desc(changes.createdAt));
  return Response.json({ changes: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body.symbol || !body.filePath) {
    return Response.json({ error: "symbol and filePath are required." }, { status: 400 });
  }
  const inserted = await db
    .insert(changes)
    .values({
      repositoryId: id,
      filePath: String(body.filePath),
      symbol: String(body.symbol),
      changeType: String(body.changeType ?? "edit"),
      oldValue: body.oldValue ? String(body.oldValue) : null,
      newValue: body.newValue ? String(body.newValue) : null,
      description: body.description ? String(body.description) : null,
    })
    .returning();
  return Response.json({ change: inserted[0] }, { status: 201 });
}
