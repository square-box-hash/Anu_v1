import type { ChatRequest } from "./types";

/**
 * Demo reply builder.
 *
 * The UI ships without a wired model on purpose: this function produces a
 * believable, context-aware answer so every surface (streaming, attachments,
 * skills, MCP, harness) can be exercised end to end. Swap it out by setting
 * GEMINI_API_KEY — see lib/providers/gemini.ts.
 */
export function buildDemoReply(req: ChatRequest): string {
  const last = [...req.messages].reverse().find((m) => m.role === "user");
  const prompt = last?.content?.trim() || "(empty prompt)";
  const skills = req.skills ?? [];
  const servers = req.mcpServers ?? [];
  const files = req.attachments ?? [];

  const lines: string[] = [];

  lines.push("**Demo mode** — the interface is live, the model isn't connected yet.");
  lines.push("");
  lines.push(`You said: *${prompt.length > 220 ? prompt.slice(0, 220) + "…" : prompt}*`);
  lines.push("");

  if (files.length) {
    lines.push("**Attachments received**");
    for (const f of files) lines.push(`- \`${f.name}\` — ${f.type || "unknown type"}, ${Math.max(1, Math.round(f.size / 1024))} KB`);
    lines.push("");
  }

  if (skills.length) {
    lines.push(`**Skills armed:** ${skills.join(", ")}`);
    lines.push("");
  }

  if (servers.length) {
    lines.push("**MCP servers attached**");
    for (const s of servers) lines.push(`- \`${s.name}\` (${s.transport}) — ${s.tools} tools exposed`);
    lines.push("");
  }

  if (req.harness?.enabled) {
    lines.push(
      `**Harness bridge:** ${req.harness.agentMode ? "agent mode" : "chat mode"}, up to ${req.harness.maxSteps} steps per turn. Tool calls would stream back here as trace cards.`,
    );
    lines.push("");
  }

  lines.push("Everything you're clicking is real UI state — history persists in `localStorage`, panels toggle, attachments queue up. Only the generation step is stubbed:");
  lines.push("");
  lines.push("```ts");
  lines.push("// lib/providers/gemini.ts");
  lines.push("export async function generate(req: ChatRequest) {");
  lines.push('  const res = await fetch(`${BASE}/${req.model}:streamGenerateContent?alt=sse`, {');
  lines.push('    method: "POST",');
  lines.push("    headers: { \"x-goog-api-key\": process.env.GEMINI_API_KEY! },");
  lines.push("    body: JSON.stringify({ contents }),");
  lines.push("  });");
  lines.push("  // pipe SSE chunks into the same UI you're looking at");
  lines.push("}");
  lines.push("```");
  lines.push("");
  lines.push("Add `GEMINI_API_KEY` to `.env.local`, then flip `DEMO` off in `app/api/chat/route.ts`. The request shape this page sends already matches `ChatRequest`.");

  return lines.join("\n");
}
