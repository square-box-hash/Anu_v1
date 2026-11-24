import { z } from "zod";

/** A notebook note: one topic, a few facts, and the links that make the graph. */
export type FactTag = "stated" | "inferred";
export type NoteScope = "chat" | "main";
export type LinkConfidence = "confirmed" | "maybe";
export type DraftKind =
  | "decision"
  | "stated_fact"
  | "correction"
  | "dead_end"
  | "open_thread"
  | "recurring_topic";

export interface Fact {
  text: string;
  /** Only what the user said is `stated`; anything the model concluded is `inferred`. */
  tag: FactTag;
  chatId?: string;
  at: number;
}

export interface NoteLink {
  to: string;
  reason: string;
  type: string;
  confidence: LinkConfidence;
}

export interface HistoryLine {
  text: string;
  replacedAt: number;
}

export interface Note {
  id: string;
  scope: NoteScope;
  title: string;
  aliases: string[];
  summary: string;
  facts: Fact[];
  links: NoteLink[];
  history: HistoryLine[];
  pinned: boolean;
  chatId?: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
  version: number;
}

export type DraftStatus = "pending" | "filing" | "filed" | "dropped" | "failed";

export interface Draft {
  id: string;
  text: string;
  topic: string;
  kind: DraftKind;
  links?: { topic: string; reason?: string }[];
  priority: "normal" | "explicit";
  status: DraftStatus;
  retries: number;
  leaseUntil?: number;
  resultOps?: string[];
  chatId?: string;
  at: number;
}

export const MAX_NOTE_WORDS = 200;
export const MAX_SUMMARY_CHARS = 140;
export const MAX_FACT_CHARS = 300;
export const MAX_JOTS_PER_TURN = 5;

/* ── what the sync model may return ─────────────────────────────────────── */

const tag = z.enum(["stated", "inferred"]);

export const operationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("append_fact"),
    draftId: z.string(),
    noteId: z.string(),
    text: z.string().min(1).max(MAX_FACT_CHARS),
    tag,
  }),
  z.object({
    op: z.literal("supersede_fact"),
    draftId: z.string(),
    noteId: z.string(),
    /** The exact old line this replaces; it moves into history. */
    replaces: z.string().min(1).max(MAX_FACT_CHARS),
    text: z.string().min(1).max(MAX_FACT_CHARS),
    tag,
  }),
  z.object({
    op: z.literal("update_summary"),
    draftId: z.string(),
    noteId: z.string(),
    summary: z.string().min(1).max(MAX_SUMMARY_CHARS),
  }),
  z.object({
    op: z.literal("add_link"),
    draftId: z.string(),
    noteId: z.string(),
    to: z.string().min(1).max(80),
    reason: z.string().min(1).max(120),
    type: z.string().min(1).max(24),
    confidence: z.enum(["confirmed", "maybe"]),
  }),
  z.object({
    op: z.literal("create_note"),
    draftId: z.string(),
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(MAX_SUMMARY_CHARS),
    facts: z
      .array(z.object({ text: z.string().min(1).max(MAX_FACT_CHARS), tag }))
      .min(1)
      .max(6),
  }),
  z.object({
    op: z.literal("no_op"),
    draftId: z.string(),
    reason: z.string().max(120).optional(),
  }),
]);

export type Operation = z.infer<typeof operationSchema>;

export const syncResponseSchema = z.object({
  operations: z.array(operationSchema).max(40),
});

/** A note id from its title, so "Anu routing" and "anu-routing" land on one note. */
export function noteIdFrom(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || `note-${Date.now().toString(36)}`;
}

/** The one-line form the index and the model see. */
export function noteSummary(note: Note): string {
  return (note.summary || note.facts[0]?.text || note.title).slice(0, MAX_SUMMARY_CHARS);
}
