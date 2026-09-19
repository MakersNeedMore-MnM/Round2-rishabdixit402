import { db } from "@/db";
import { repositories } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { analyzeRepository } from "@/lib/service";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

function repoNameFromUrl(url: string): string {
  try {
    const parts = String(url).replace(/\/$/, "").split("/");
    const last = parts[parts.length - 1].replace(/\.git$/, "");
    return last || "connected-repo";
  } catch {
    return "connected-repo";
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    // allow demo preview without login by seeding + returning demo repos
    try {
      const seed = await ensureSeed();
      const rows = await db
        .select()
        .from(repositories)
        .where(eq(repositories.userId, seed.userId))
        .orderBy(desc(repositories.createdAt));
      return Response.json({ repositories: rows, demo: true });
    } catch {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const rows = await db
    .select()
    .from(repositories)
    .where(eq(repositories.userId, user.id))
    .orderBy(desc(repositories.createdAt));
  return Response.json({ repositories: rows });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { githubUrl, branch, name, description } = await req.json();
    if (!githubUrl) return Response.json({ error: "GitHub URL is required." }, { status: 400 });
    const repoName = name?.trim() || repoNameFromUrl(githubUrl);
    const inserted = await db
      .insert(repositories)
      .values({
        userId: user.id,
        name: repoName,
        githubUrl: String(githubUrl),
        branch: branch || "main",
        description: description || null,
        status: "pending",
        isDemo: false,
      })
      .returning();
    const repo = inserted[0];
    // analyze async-ish (await for MVP reliability)
    try {
      await analyzeRepository(repo.id);
    } catch (e) {
      console.error("analyze failed", e);
    }
    const fresh = await db.select().from(repositories).where(eq(repositories.id, repo.id)).limit(1);
    return Response.json({ repository: fresh[0] ?? repo }, { status: 201 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not connect repository." }, { status: 500 });
  }
}
