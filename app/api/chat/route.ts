import { NextResponse } from "next/server";
import { generateStream } from "@/lib/providers/gemini";
import type { ChatRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams newline delimited JSON events:
 *   {"type":"thought","text":"…"}  reasoning tokens
 *   {"type":"text","text":"…"}     answer tokens
 *   {"type":"error","text":"…"}    failure detail
 */
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

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY is not set on the server. Add it to .env.local (or your Vercel env vars) and redeploy.",
      },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: { type: string; text: string }) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        for await (const event of generateStream(body)) send(event);
      } catch (error) {
        send({ type: "error", text: error instanceof Error ? error.message : "Unknown provider error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
