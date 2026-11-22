import { NextResponse } from "next/server";
import { resolveApproval } from "@/lib/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Answers a parked tool call. The chat request is waiting on this, so a `true`
 * here is what lets the call reach the MCP server.
 */
export async function POST(request: Request) {
  let body: { id?: string; allow?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body?.id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  const resolved = resolveApproval(body.id, Boolean(body.allow));
  return NextResponse.json({ ok: resolved, id: body.id });
}
