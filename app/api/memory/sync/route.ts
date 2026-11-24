import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { denialFor } from "@/lib/memory/deny";
import { MAX_FACT_CHARS, MAX_SUMMARY_CHARS, syncResponseSchema } from "@/lib/memory/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Files jotted lines into the chat notebook. The model only proposes; the
 * browser applies, so a bad answer cannot write anything the schema rejects.
 */
const SYNC_MODEL = process.env.ANU_MEMORY_MODEL || "gemini-3.5-flash-lite";

const requestSchema = z.object({
  drafts: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1).max(MAX_FACT_CHARS),
        topic: z.string().min(1).max(80),
        kind: z.string().max(24),
        links: z.array(z.object({ topic: z.string(), reason: z.string().optional() })).optional(),
      }),
    )
    .min(1)
    .max(20),
  notes: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        summary: z.string().max(MAX_SUMMARY_CHARS).optional(),
        aliases: z.array(z.string()).optional(),
      }),
    )
    .max(60)
    .default([]),
  turns: z
    .array(z.object({ role: z.string(), content: z.string().max(2000) }))
    .max(4)
    .default([]),
});

const SYSTEM = `You file notes into a notebook. Input: draft lines, the target note, neighbor summaries, recent turns. Output JSON only, a list of operations from the allowed set.
Prefer updating an existing note over creating one. One topic per note.
Keep stated and inferred apart. Replace, do not stack, contradicting facts, keeping one history line. Drop lines that are not worth keeping. Never copy detail into a main summary.

Allowed operations (JSON objects in an "operations" array, each with the draftId it came from):
- {"op":"append_fact","draftId","noteId","text","tag":"stated|inferred"}
- {"op":"supersede_fact","draftId","noteId","replaces","text","tag"}   // replaces must be the exact old line
- {"op":"update_summary","draftId","noteId","summary"}                  // one line, ${MAX_SUMMARY_CHARS} chars max
- {"op":"add_link","draftId","noteId","to","reason","type","confidence":"confirmed|maybe"}
- {"op":"create_note","draftId","title","summary","facts":[{"text","tag"}]}
- {"op":"no_op","draftId","reason"}

Rules you must follow:
- "stated" only for what the user themselves said; anything from a tool, a page or your own conclusion is "inferred".
- Link before you create: if an existing note covers the topic (title or alias), update it and do not create a second one.
- A draft that is small talk, a finished task, code, or a guess becomes no_op.
- Every draftId in the input must appear in exactly one operation.
- Output the JSON object only, with no prose and no code fence.`;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ operations: [], error: "GEMINI_API_KEY is not set on the server." });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ operations: [], error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ operations: [], error: "drafts[] is required." }, { status: 400 });
  }

  // Plain code before the model: a line that carries a secret never leaves.
  const drafts = parsed.data.drafts.filter((draft) => {
    const denial = denialFor(draft.text) ?? denialFor(draft.topic);
    return !denial;
  });
  const droppedIds = parsed.data.drafts.filter((draft) => !drafts.includes(draft)).map((draft) => draft.id);

  if (!drafts.length) {
    return NextResponse.json({
      operations: droppedIds.map((draftId) => ({ op: "no_op", draftId, reason: "withheld by the deny-list" })),
      model: SYNC_MODEL,
      dropped: droppedIds.length,
    });
  }

  const prompt = [
    "Draft lines to file:",
    ...drafts.map(
      (draft) =>
        `- draftId=${draft.id} | topic=${draft.topic} | kind=${draft.kind} | ${draft.text}${
          draft.links?.length ? ` | links: ${draft.links.map((link) => link.topic).join(", ")}` : ""
        }`,
    ),
    "",
    "Notes already in this chat's notebook:",
    ...(parsed.data.notes.length
      ? parsed.data.notes.map(
          (note) =>
            `- noteId=${note.id} | ${note.title}${note.aliases?.length ? ` (aliases: ${note.aliases.join(", ")})` : ""}${
              note.summary ? ` — ${note.summary}` : ""
            }`,
        )
      : ["- none"]),
    "",
    parsed.data.turns.length
      ? `Recent turns:\n${parsed.data.turns.map((turn) => `${turn.role}: ${turn.content}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
    const result = await ai.models.generateContent({
      model: SYNC_MODEL,
      contents: prompt,
      config: { systemInstruction: SYSTEM, temperature: 0.2, responseMimeType: "application/json" },
    });

    const raw = (result.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json({ operations: [], error: "The sync model returned no JSON.", model: SYNC_MODEL });
    }

    const validated = syncResponseSchema.safeParse(json);
    if (!validated.success) {
      return NextResponse.json({
        operations: [],
        error: "The sync model returned operations outside the allowed set.",
        model: SYNC_MODEL,
      });
    }

    return NextResponse.json({
      operations: validated.data.operations,
      model: SYNC_MODEL,
      dropped: droppedIds.length,
    });
  } catch (error) {
    return NextResponse.json({
      operations: [],
      error: error instanceof Error ? error.message : "Sync failed.",
      model: SYNC_MODEL,
    });
  }
}
