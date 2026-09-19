import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, verifyPassword } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";

export async function POST(req: Request) {
  try {
    await ensureSeed().catch(() => null);
    const { email, password } = await req.json();
    if (!email || !password) {
      return Response.json({ error: "Email and password are required." }, { status: 400 });
    }
    const rows = await db.select().from(users).where(eq(users.email, String(email).toLowerCase())).limit(1);
    if (rows.length === 0) {
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }
    const ok = await verifyPassword(String(password), rows[0].passwordHash);
    if (!ok) {
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }
    await createSession(rows[0].id);
    return Response.json({ user: { id: rows[0].id, email: rows[0].email, name: rows[0].name } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Login failed." }, { status: 500 });
  }
}
