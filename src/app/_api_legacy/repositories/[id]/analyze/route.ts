import { db } from "@/db";
import { repositories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { analyzeRepository } from "@/lib/service";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const analysisId = await analyzeRepository(id);
    const rows = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1);
    return Response.json({ ok: true, analysisId, repository: rows[0] });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Analysis failed." }, { status: 500 });
  }
}
