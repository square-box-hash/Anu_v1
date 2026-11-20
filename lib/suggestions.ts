/**
 * The suggestion cards under the composer.
 *
 * They rotate once a day rather than being generated, and that is deliberate:
 * each card is an affordance for something this app can actually do — a skill,
 * an MCP tool, a JSON extraction, a live-translate session. A model asked for
 * four ideas would invent capabilities that do not exist, and the cards would
 * stop being an honest map of the product.
 *
 * Selection is deterministic per day, so the set is stable while you use it and
 * different tomorrow.
 */

export type SuggestionIcon =
  | "sparkles"
  | "terminal"
  | "layers"
  | "bolt"
  | "file"
  | "database"
  | "globe"
  | "languages"
  | "mic"
  | "cpu"
  | "search"
  | "mail"
  | "book"
  | "image"
  | "link"
  | "sliders";

export interface Suggestion {
  id: string;
  icon: SuggestionIcon;
  title: string;
  body: string;
}

export const SUGGESTION_POOL: Suggestion[] = [
  {
    id: "chem",
    icon: "sparkles",
    title: "Solve chemistry doubts",
    body: "Explain SN1 vs SN2 reaction mechanisms with energy diagrams and stereochemistry.",
  },
  {
    id: "code",
    icon: "terminal",
    title: "Architect & delegate code",
    body: "Design a multi-module TypeScript queue and write focused unit tests for edge cases.",
  },
  {
    id: "json",
    icon: "layers",
    title: "Extract structured JSON",
    body: "Drop a large log or document and compress key facts into clean typed JSON.",
  },
  {
    id: "chat",
    icon: "bolt",
    title: "Casual quick chat",
    body: "Brainstorm weekend project ideas I can build and share with 20–30 friends.",
  },
  {
    id: "pdf",
    icon: "file",
    title: "Read a document",
    body: "Attach a PDF or Word file and ask for the three claims it does not support.",
  },
  {
    id: "maths",
    icon: "sparkles",
    title: "Work through the maths",
    body: "Derive the bias-variance decomposition step by step, with the algebra shown.",
  },
  {
    id: "debug",
    icon: "terminal",
    title: "Debug a stack trace",
    body: "Paste the error and the failing function; ask for the smallest change that fixes it.",
  },
  {
    id: "mcp",
    icon: "link",
    title: "Connect a tool",
    body: "Wire an MCP server — filesystem, search or SRag — and let the model call it mid-answer.",
  },
  {
    id: "skill",
    icon: "book",
    title: "Arm a skill",
    body: "Load a SKILL.md that fixes the house style before it writes a single line.",
  },
  {
    id: "research",
    icon: "globe",
    title: "Research with sources",
    body: "Search, index and compare what several sources actually say, with the conflicts kept in.",
  },
  {
    id: "translate",
    icon: "languages",
    title: "Live translate a call",
    body: "Switch to live translate and speak — Hindi in, English out, as it happens.",
  },
  {
    id: "voice",
    icon: "mic",
    title: "Talk it through",
    body: "Use voice mode to think out loud, then ask for the decision written down.",
  },
  {
    id: "data",
    icon: "database",
    title: "Query a database",
    body: "Point it at a SQLite file and ask questions in plain language.",
  },
  {
    id: "writing",
    icon: "mail",
    title: "Tighten a draft",
    body: "Paste an email or a paragraph and ask what a busy reader would skip.",
  },
  {
    id: "plan",
    icon: "sliders",
    title: "Plan before building",
    body: "Turn a vague idea into a sequenced plan with the risky step named first.",
  },
  {
    id: "image",
    icon: "image",
    title: "Describe a screenshot",
    body: "Drop a UI screenshot and ask what a new user would fail to find.",
  },
];

/** Small deterministic shuffle so the same day gives the same cards. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Four cards, stable for the day, different tomorrow. */
export function pickSuggestions(now: Date = new Date(), count = 4): Suggestion[] {
  const day = Math.floor(now.getTime() / 86_400_000);
  return seededShuffle(SUGGESTION_POOL, day).slice(0, count);
}
