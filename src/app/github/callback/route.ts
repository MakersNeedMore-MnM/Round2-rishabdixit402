import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  // Redirect to /api/github/callback preserving code and state params
  const redirectUrl = new URL(`/api/github/callback${url.search}`, request.url);
  return NextResponse.redirect(redirectUrl);
}
