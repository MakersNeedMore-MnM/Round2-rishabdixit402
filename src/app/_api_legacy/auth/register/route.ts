import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, hashPassword } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";

export async function POST(req: Request) {
  try {
    await ensureSeed().catch(() => null);
    const { email, password, name } = await req.json();
    if (!email || !password || !name) {
      return Response.json({ error: "Name, email and password are required." }, { status: 400 });
    }
    const existing = await db.select().from(users).where(eq(users.email, String(email).toLowerCase())).limit(1);
    if (existing.length > 0) {
      return Response.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    const passwordHash = await hashPassword(String(password));
    const inserted = await db
      .insert(users)
      .values({
        email: String(email).toLowerCase(),
        name: String(name),
        passwordHash,
        avatarHue: Math.floor(Math.random() * 360),
      })
      .returning({ id: users.id, email: users.email, name: users.name });
    await createSession(inserted[0].id);
    return Response.json({ user: inserted[0] });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Registration failed." }, { status: 500 });
  }
}
