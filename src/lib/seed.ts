import { db } from "@/db";
import { repositories, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "./auth";
import { DEMO_REPO_NAME, DEMO_REPO_URL } from "./demo-repo";
import { analyzeRepository } from "./service";

export async function ensureSeed(): Promise<{ userId: string; demoRepoId: string }> {
  let userRows = await db.select().from(users).where(eq(users.email, "demo@regit.dev")).limit(1);
  let userId: string;
  if (userRows.length === 0) {
    const passwordHash = await hashPassword("regit-demo-123");
    const inserted = await db
      .insert(users)
      .values({ email: "demo@regit.dev", name: "Rishab Dixit", passwordHash, avatarHue: 95 })
      .returning({ id: users.id });
    userId = inserted[0].id;
  } else {
    userId = userRows[0].id;
  }

  const existingRepos = await db
    .select()
    .from(repositories)
    .where(eq(repositories.userId, userId))
    .limit(10);

  let demo = existingRepos.find((r) => r.isDemo);
  if (!demo) {
    const inserted = await db
      .insert(repositories)
      .values({
        userId,
        name: DEMO_REPO_NAME,
        githubUrl: DEMO_REPO_URL,
        branch: "main",
        description: "Intentionally-designed demo: rename fallout, contract breaks, missing auth, cleanup targets.",
        status: "pending",
        isDemo: true,
      })
      .returning();
    demo = inserted[0];
  }

  if (demo.status !== "ready") {
    try {
      await analyzeRepository(demo.id);
    } catch (e) {
      console.error("seed analysis failed", e);
    }
  }

  // second sample repo for liveliness
  if (existingRepos.length < 2) {
    const second = await db
      .insert(repositories)
      .values({
        userId,
        name: "billing-api",
        githubUrl: "https://github.com/rishabdixit4021/billing-api",
        branch: "main",
        description: "Sample service connected to preview multi-repo impact. Auto-analyzed scaffold.",
        status: "pending",
        isDemo: false,
      })
      .returning();
    try {
      await analyzeRepository(second[0].id);
    } catch (e) {
      console.error("second seed failed", e);
    }
  }

  return { userId, demoRepoId: demo.id };
}
