import { db } from "@/db";
import { repositories } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const rows = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.id, id), eq(repositories.userId, user.id)))
    .limit(1);
  if (rows.length === 0) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ repository: rows[0] });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) patch.name = String(body.name);
  if (body.branch) patch.branch = String(body.branch);
  if (body.description !== undefined) patch.description = body.description ? String(body.description) : null;
  if (body.githubUrl) patch.githubUrl = String(body.githubUrl);
  await db.update(repositories).set(patch).where(and(eq(repositories.id, id), eq(repositories.userId, user.id)));
  const rows = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1);
  return Response.json({ repository: rows[0] });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await db.delete(repositories).where(and(eq(repositories.id, id), eq(repositories.userId, user.id)));
  return Response.json({ ok: true });
}
