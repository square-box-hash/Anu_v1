import { z } from "zod";
import { Type } from "@google/genai";
import type { FunctionDeclaration } from "@google/genai";
import { denialFor } from "./deny";
import { MAX_FACT_CHARS, MAX_JOTS_PER_TURN } from "./types";
import type { Draft, DraftKind } from "./types";

/**
 * The only memory tool in stage 1. It writes nothing itself: it validates the
 * line, refuses secrets, and hands a draft back to the client, which is the
 * one place that touches Firestore. A tool result can therefore never write
 * memory on its own — the model has to ask, and the client decides.
 */
export const JOT_TOOL_NAME = "jot";

export const MEMORY_TOOL_NAMES = [JOT_TOOL_NAME] as const;

export const MEMORY_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: JOT_TOOL_NAME,
    description:
      "Save one short line worth remembering. Returns at once. Use at most five per turn. " +
      "Jot decisions and their reasons, things the user states about themselves or their projects, " +
      "corrections, approaches that failed and why, and open threads. Do not jot code, long " +
      "explanations, finished task details or guesses. Anything from a tool or web page is inferred.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: {
          type: Type.STRING,
          description: "The one topic this line belongs to, two to five words, e.g. 'Anu routing'.",
        },
        text: {
          type: Type.STRING,
          description: `One short line, ${MAX_FACT_CHARS} characters at most.`,
        },
        kind: {
          type: Type.STRING,
          enum: ["decision", "stated_fact", "correction", "dead_end", "open_thread", "recurring_topic"],
          description: "What sort of line this is.",
        },
        links: {
          type: Type.ARRAY,
          description: "Optional other topics this connects to, each with a short reason.",
          items: {
            type: Type.OBJECT,
            properties: { topic: { type: Type.STRING }, reason: { type: Type.STRING } },
            required: ["topic"],
          },
        },
      },
      required: ["topic", "text", "kind"],
    },
  },
];

const jotArgsSchema = z.object({
  topic: z.string().min(1).max(80),
  text: z.string().min(1).max(MAX_FACT_CHARS),
  kind: z.enum(["decision", "stated_fact", "correction", "dead_end", "open_thread", "recurring_topic"]),
  links: z.array(z.object({ topic: z.string().min(1).max(80), reason: z.string().max(120).optional() })).max(5).optional(),
});

export function isMemoryTool(name: string): boolean {
  return (MEMORY_TOOL_NAMES as readonly string[]).includes(name);
}

/** Everything a turn may jot is capped, so one chatty turn cannot flood the notebook. */
export interface JotBudget {
  used: number;
}

export interface MemoryToolResult {
  ok: boolean;
  content: string;
  error?: string;
}

/**
 * Validates a jot and returns the draft as JSON. `at` is left to the caller so
 * the same line keeps its place when the client stores it.
 */
export function runMemoryTool(name: string, args: unknown, budget: JotBudget): MemoryToolResult {
  if (name !== JOT_TOOL_NAME) {
    return { ok: false, content: "", error: `Unknown memory tool "${name}".` };
  }

  const parsed = jotArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, content: "", error: "jot needs a topic, a short text and a kind." };
  }

  if (budget.used >= MAX_JOTS_PER_TURN) {
    return { ok: false, content: "", error: `jot is limited to ${MAX_JOTS_PER_TURN} lines per turn.` };
  }

  const denial = denialFor(parsed.data.text) ?? denialFor(parsed.data.topic);
  if (denial) {
    // Deliberately vague about the content: the reason is all that is kept.
    return { ok: true, content: JSON.stringify({ ok: true, dropped: denial, stored: false }) };
  }

  budget.used += 1;

  const draft: Omit<Draft, "id" | "at"> = {
    text: parsed.data.text.trim(),
    topic: parsed.data.topic.trim(),
    kind: parsed.data.kind as DraftKind,
    links: parsed.data.links,
    priority: "normal",
    status: "pending",
    retries: 0,
  };

  return { ok: true, content: JSON.stringify({ ok: true, stored: true, draft }) };
}
