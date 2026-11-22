import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Names a chat from its first exchange.
 *
 * Runs on the smallest, fastest model in the roster (a lite reader, not a
 * planner) because this is a single-line summarisation that a user waits on
 * while looking at the sidebar. `ANU_TITLE_MODEL` overrides it.
 */
const TITLE_MODEL = process.env.ANU_TITLE_MODEL || "gemini-3.1-flash-lite";
/** Two or three words: a sidebar row, not a summary. */
const MAX_WORDS = 3;
const MAX_TITLE_CHARS = 32;

function cleanTitle(raw: string): string {
  const firstLine = raw.trim().split(/\r?\n/)[0] ?? "";
  const stripped = firstLine
    .replace(/^["'`*#\s]+/, "")
    .replace(/["'`*.\s]+$/, "")
    .replace(/^(title|chat title)\s*[:\-—]\s*/i, "");
  const words = stripped.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  return words.join(" ").slice(0, MAX_TITLE_CHARS).trim();
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      title: null,
      error: "GEMINI_API_KEY is not set on the server.",
    });
  }

  let body: { messages?: { role?: string; content?: string }[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ title: null, error: "Invalid JSON body." }, { status: 400 });
  }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const userText = messages.find((m) => m.role === "user" && m.content?.trim())?.content ?? "";
  const assistantText = messages.find((m) => m.role === "assistant" && m.content?.trim())?.content ?? "";

  if (!userText.trim()) {
    return NextResponse.json({ title: null, error: "Nothing to summarise." }, { status: 400 });
  }

  const prompt = [
    "Name this conversation for a sidebar list.",
    `Rules: 2 or 3 words, never more than ${MAX_WORDS}. No quotes. No trailing period.`,
    'Name the subject itself, not the request: "cron jobs at midnight", not "Chat about scheduling".',
    'No prefix such as "Chat about" or "Discussion of".',
    "Reply with the title only.",
    "",
    `User: ${userText.slice(0, 600)}`,
    assistantText ? `Assistant: ${assistantText.slice(0, 600)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
    const result = await ai.models.generateContent({
      model: TITLE_MODEL,
      contents: prompt,
      config: { temperature: 0.3, maxOutputTokens: 24 },
    });

    const title = cleanTitle(result.text ?? "");
    if (!title) {
      return NextResponse.json({ title: null, error: "The model returned no title." });
    }
    return NextResponse.json({ title, model: TITLE_MODEL });
  } catch (error) {
    return NextResponse.json({
      title: null,
      error: error instanceof Error ? error.message : "Title generation failed.",
    });
  }
}
