import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { DayPart } from "@/lib/greeting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One line to sit under the greeting. Small and fast on purpose: a lite model
 * writing a sentence, not a planner reasoning about one.
 */
const GREETING_MODEL = process.env.ANU_GREETING_MODEL || "gemini-3.1-flash-lite";
const MAX_CHARS = 140;

const PART_HINT: Record<DayPart, string> = {
  early: "It is the small hours of the morning and the person is still awake.",
  morning: "It is morning.",
  afternoon: "It is the afternoon.",
  evening: "It is evening.",
  night: "It is late at night.",
};

function clean(raw: string): string {
  const line = raw.trim().split(/\r?\n/)[0] ?? "";
  return line
    .replace(/^["'`*\s]+/, "")
    .replace(/["'`*.\s]+$/, "")
    .slice(0, MAX_CHARS)
    .trim();
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ line: null, error: "GEMINI_API_KEY is not set on the server." });
  }

  let body: { name?: string; part?: DayPart; weekday?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ line: null, error: "Invalid JSON body." }, { status: 400 });
  }

  const part: DayPart = body?.part ?? "morning";
  const weekday = (body?.weekday ?? "").slice(0, 12);
  const name = (body?.name ?? "").slice(0, 40);
  // Asked for variety on every request; the client caches per day, so this is
  // once per part-of-day rather than once per open.
  const mode = ["a small true fact", "a playful remark about the hour", "a tiny nudge about focus or rest"][
    Math.floor(Math.random() * 3)
  ];

  const prompt = [
    "Write ONE short line that appears under a greeting in a chat app.",
    `${PART_HINT[part]}${weekday ? ` It is ${weekday}.` : ""}`,
    `Style for this one: ${mode}.`,
    "",
    "Rules:",
    "- At most 16 words, one sentence, no emoji, no quotation marks.",
    "- Warm and specific, not corporate. Dry humour is fine.",
    "- Do NOT mention news, current events, prices, sport results or anything dated.",
    "- Do NOT invent statistics or dates. If you are not certain a fact is true, write a quip instead.",
    "- Do not use the person's name, and do not start with 'Good morning'.",
    "",
    "Reply with the line only.",
    name ? `(The person's name is ${name} — do not use it.)` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
    const result = await ai.models.generateContent({
      model: GREETING_MODEL,
      contents: prompt,
      config: { temperature: 1.0, maxOutputTokens: 40 },
    });

    const line = clean(result.text ?? "");
    if (!line) return NextResponse.json({ line: null, error: "The model returned nothing." });
    return NextResponse.json({ line, model: GREETING_MODEL });
  } catch (error) {
    return NextResponse.json({
      line: null,
      error: error instanceof Error ? error.message : "Greeting generation failed.",
    });
  }
}
