import { NextRequest, NextResponse } from "next/server";

const FLASK_BACKEND_URL = process.env.FLASK_BACKEND_URL || "http://127.0.0.1:5000";

async function proxy(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const resolved = await params;
  const targetPath = resolved.path ? resolved.path.join("/") : "";
  const url = new URL(request.url);
  const targetUrl = `${FLASK_BACKEND_URL}/api/${targetPath}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set("host", "127.0.0.1:5000");
  // Keep the browser-facing origin so the backend can build correct absolute
  // URLs (notably the GitHub OAuth redirect_uri) instead of guessing.
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  try {
    const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });

    const respHeaders = new Headers(response.headers);
    respHeaders.delete("content-encoding");

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Flask backend error", details: err?.message || String(err) },
      { status: 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
