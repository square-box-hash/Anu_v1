import { NextResponse } from "next/server";
import { buildDemoReply } from "@/lib/demo";
import { generate, isConfigured } from "@/lib/providers/gemini";
import type { ChatRequest } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.messages?.length) {
    return NextResponse.json({ error: "messages[] is required" }, { status: 400 });
  }

  // Demo mode: no credentials, or explicitly forced with NEBULA_DEMO=1.
  const demo = process.env.NEBULA_DEMO === "1" || !isConfigured();

  if (demo) {
    return NextResponse.json({ text: buildDemoReply(body), model: body.model, demo: true });
  }

  try {
    const result = await generate(body);
    return NextResponse.json({ ...result, demo: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown provider error";
    return NextResponse.json(
      { text: `Provider error — falling back to demo output.\n\n\`\`\`\n${message}\n\`\`\`\n\n${buildDemoReply(body)}`, model: body.model, demo: true },
      { status: 200 },
    );
  }
}
