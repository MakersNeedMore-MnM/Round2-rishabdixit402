import { db } from "@/db";
import { cleanupItems } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const rows = await db.select().from(cleanupItems).where(eq(cleanupItems.repositoryId, id)).orderBy(desc(cleanupItems.createdAt));
  return Response.json({ cleanup: rows });
}
