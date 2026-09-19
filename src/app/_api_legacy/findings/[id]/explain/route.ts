import { db } from "@/db";
import { findings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { explainFinding } from "@/lib/ai";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const rows = await db.select().from(findings).where(eq(findings.id, id)).limit(1);
  if (rows.length === 0) return Response.json({ error: "Not found" }, { status: 404 });
  const f = rows[0];
  if (f.aiExplanation) {
    return Response.json({ explanation: f.aiExplanation, provider: "cached", finding: f });
  }
  const { text, provider } = await explainFinding({
    ruleId: f.ruleId,
    severity: f.severity,
    title: f.title,
    description: f.description,
    filePath: f.filePath,
    symbol: f.symbol,
    evidence: f.evidence as {
      files: string[];
      symbols: string[];
      lines?: Array<{ file: string; line: number; snippet: string }>;
      relationship?: string;
      suggestion?: string;
    },
  });
  await db.update(findings).set({ aiExplanation: text }).where(eq(findings.id, id));
  return Response.json({ explanation: text, provider });
}
