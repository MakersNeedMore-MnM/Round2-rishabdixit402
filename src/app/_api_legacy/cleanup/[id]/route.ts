import { db } from "@/db";
import { cleanupItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = String(body.status ?? "");
  if (!["pending", "approved", "dismissed", "applied"].includes(status)) {
    return Response.json({ error: "Invalid status." }, { status: 400 });
  }
  await db.update(cleanupItems).set({ status }).where(eq(cleanupItems.id, id));
  const rows = await db.select().from(cleanupItems).where(eq(cleanupItems.id, id)).limit(1);
  return Response.json({ item: rows[0] });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await db.delete(cleanupItems).where(eq(cleanupItems.id, id));
  return Response.json({ ok: true });
}
