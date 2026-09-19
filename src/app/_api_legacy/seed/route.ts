import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const seed = await ensureSeed();
    return Response.json({ ok: true, ...seed });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Seed failed." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const seed = await ensureSeed();
    return Response.json({ ok: true, ...seed });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Seed failed." }, { status: 500 });
  }
}
