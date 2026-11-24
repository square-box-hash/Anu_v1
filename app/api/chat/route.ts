import { NextResponse } from "next/server";
import {
  SUBAGENT_TOOL_DECLARATION,
  SUBAGENT_TOOL_NAME,
  compressContext,
  isApiKeyInvalidError,
  runAntigravityInteraction,
  runSubagentTask,
  streamGemini,
  streamOpenAiCompatible,
  toContents,
  toFunctionDeclarations,
  triagePrompt,
} from "@/lib/providers/gemini";
import type { Content, Part } from "@/lib/providers/gemini";
import { APPROVAL_TIMEOUT_MS, waitForApproval } from "@/lib/approvals";
import { callTool, listAllTools } from "@/lib/mcp";
import { extractSources } from "@/lib/sources";
import { isMemoryTool, runMemoryTool, MEMORY_TOOL_DECLARATIONS } from "@/lib/memory/tools";
import type { JotBudget } from "@/lib/memory/tools";
import type { McpTool } from "@/lib/mcp";
import type { McpServerConfig } from "@/lib/mcp";
import { MEMORY_CONFIG } from "@/lib/memory";
import { AUTO_MODEL_ID, DEFAULT_MODEL, DEFAULT_ORCHESTRATION_CONFIG, findModel } from "@/lib/models";
import { SKILL_TOOL_DECLARATIONS, SKILL_TOOL_NAMES, listSkills, runSkillTool } from "@/lib/skills";
import type { ChatRequest, RoutingInfo, Usage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Event =
  | { type: "meta"; route: RoutingInfo }
  | { type: "text"; text: string }
  | { type: "thought"; text: string }
  | { type: "notice"; text: string }
  | { type: "tool_call"; id: string; server: string; name: string; args: unknown; awaiting?: boolean }
  | { type: "tool_result"; id: string; ok: boolean; content: string; error?: string }
  | { type: "error"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "ping" };

const isSkillTool = (name: string) => (SKILL_TOOL_NAMES as readonly string[]).includes(name);

/**
 * Every reply is rendered with GitHub-flavoured Markdown (remark-gfm +
 * KaTeX), so the model is told what the renderer can actually draw instead of
 * staying on plain paragraphs.
 */
const MARKDOWN_NOTE = [
  "Replies render as GitHub-flavoured Markdown. Use it where it helps the reader:",
  "## headings, **bold**, `inline code`, fenced code blocks with a language tag,",
  "- and 1. lists, > quotes, [links](https://example.com), ~~strikethrough~~,",
  "tables for comparisons and specs (header row, then a |---|:--:| separator row),",
  "- [ ] task lists for steps, and $inline$ / $$display$$ maths (KaTeX).",
  "An image URL that came back from a tool renders inline with ![what it shows](https://…); use it when the user asked to see something.",
  "Keep prose first: a table or a code fence carries data, it does not replace the explanation.",
].join(" ");

/**
 * When to reach for a tool. Handing a model a search tool without saying when
 * to call it produces confident answers from memory, so the rule is written
 * down here — and it names the tools that are actually connected this turn.
 */
const CITATION_NOTE = [
  "When a claim comes from a tool result, put its source number right after the claim, like [2],",
  "and group them when several support one sentence: [1][3].",
  'Use only the numbers listed under "Numbered sources" in tool results — never an id, hash, chunk',
  "reference or URL that appears inside a result, and never a number you did not see in that list.",
  "Say which claims are only reported and not confirmed, and name who reported them.",
].join(" ");

function toolPolicyFor(tools: McpTool[]): string {
  if (!tools.length) {
    return [
      "No tools are connected in this chat.",
      "Answer from what you know whenever you are sure. If the question turns on something you",
      "cannot know — news, prices, releases, versions, who currently holds a role, anything after",
      "your training data — say plainly that you cannot check it and what to look up.",
      "Never present a guess as a current fact.",
    ].join(" ");
  }

  const catalogue = tools
    .map((tool) => `- ${tool.qualified}: ${tool.description.split("\n")[0].slice(0, 180)}`)
    .join("\n");

  return [
    "Tools you can call in this turn:",
    catalogue,
    "Call one when — and only then:",
    "- The answer could have changed since your training data: news, prices, releases, versions,",
    "deprecations, sports results, who currently holds a role, or the words latest, new, current or now.",
    "- The user names something that looks recently released, and you are genuinely unsure of it.",
    "- The user asks you to check, verify, quote or cite a source.",
    "Skip the tool when:",
    "- The answer is settled knowledge that does not change: a molecule's geometry or bond angle,",
    "a definition, a formula, arithmetic, an established law, well-known history, or syntax you know.",
    "Answer those yourself — searching for them wastes the user's time and makes the reply slower.",
    "- You can answer correctly and confidently from memory. A search is a cost the user pays;",
    "it is not a way to feel safer about something you already know.",
    "- The user wants your judgement, a rewrite, or reasoning over what they have already given you.",
    "When you do search: one well-chosen query is usually enough. Refine only if the result was empty,",
    "off-target, or contradicts itself.",
    "How to answer afterwards:",
    "- Answer from what the tool returned and say where it came from. If it fails or returns nothing,",
    "say that instead of filling the gap from memory.",
    "- Do not call a tool twice for the same fact, and do not narrate the search — just use it.",
  ].join("\n");
}

/**
 * Guidance the user attached to one MCP server. It stays next to the server it
 * describes — "search the city name too" only makes sense for the news tool —
 * so every server can carry its own rules instead of one global blob.
 */
function serverInstructionsFor(servers: ChatRequest["mcpServers"]): string {
  const noted = (servers ?? []).filter((server) => server?.name && server.instructions?.trim());
  if (!noted.length) return "";
  return [
    "Instructions the user attached to specific tool servers — follow them when you use that server:",
    ...noted.map((server) => `- ${server.name}: ${String(server.instructions).trim()}`),
  ].join("\n");
}

function systemPromptFor(
  body: ChatRequest,
  skills: { name: string; description: string }[],
  contextBrief?: string | null,
  routeNote?: string,
  tools: McpTool[] = [],
): string {
  const blocks: string[] = [];
  if (body.systemPrompt?.trim()) blocks.push(body.systemPrompt.trim());

  if (routeNote) blocks.push(routeNote);

  blocks.push(MARKDOWN_NOTE);
  blocks.push(CITATION_NOTE);

  if (body.attachments?.length) {
    const fileSummaries = body.attachments.map((a) =>
      a.textContent?.trim()
        ? `Attached file "${a.name}" (${a.type}, ${a.size} bytes):\n\`\`\`\n${a.textContent.slice(0, 18000)}\n\`\`\``
        : `Attached file "${a.name}" (${a.type}, ${a.size} bytes)`,
    );
    blocks.push(fileSummaries.join("\n\n"));
  }

  if (contextBrief) {
    blocks.push(`Compressed context summary (prepared by Step 2 Context Lite):\n${contextBrief}`);
  }

  if (skills.length) {
    blocks.push(
      `Skills available in this workspace:\n${skills
        .map((skill) => `- ${skill.name}: ${skill.description}`)
        .join("\n")}\nCall load_skill(name) to read a skill before doing work it covers, and read_skill_file(skill, path) for its supporting files.`,
    );
  }

  if (body.skills?.length) {
    // A rule is a name, the one line that rides every turn, and its full rules.
    const rendered = body.skills.map((skill) => {
      if (typeof skill === "string") return `- ${skill}`;
      const head = `- ${skill.name}${skill.description ? ` — ${skill.description}` : ""}`;
      const rules = skill.rules?.trim();
      return rules ? `${head}\n  ${rules.replace(/\n/g, "\n  ")}` : head;
    });
    blocks.push(`Inline instructions from the user — follow these when they apply:\n${rendered.join("\n")}`);
  }

  blocks.push(toolPolicyFor(tools));

  const serverNotes = serverInstructionsFor(body.mcpServers);
  if (serverNotes) blocks.push(serverNotes);

  if (body.harness?.enabled) {
    blocks.push(
      `Agent mode is enabled. You may chain up to ${body.harness.maxSteps} tool steps in this turn and should keep going until the task is done.`,
    );
  }

  return blocks.join("\n\n");
}

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

  const orchestration = body.orchestration ?? DEFAULT_ORCHESTRATION_CONFIG;
  const requestedModel = body.model || DEFAULT_MODEL;
  const customEntry = findModel(requestedModel, body.customModels);
  const isCustomHttp = customEntry?.provider === "openai-compatible";

  if (!isCustomHttp && !process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      {
        error: "GEMINI_API_KEY is not set on the server. Check your server environment configuration.",
      },
      { status: 500 },
    );
  }

  const servers: McpServerConfig[] = (body.mcpServers ?? [])
    .filter((server) => server?.target)
    .map((server, index) => ({
      id: server.id ?? `server-${index}`,
      name: server.name,
      transport: server.transport,
      target: server.target,
      headers: server.headers,
      instructions: server.instructions,
    }));

  const encoder = new TextEncoder();
  const maxSteps = Math.min(Math.max(body.harness?.maxSteps ?? 6, 1), 12);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      // The model can think for a minute before its first token, and a response
      // body that sends nothing for that long gets reaped by proxies and load
      // balancers. One byte now, then a ping every ten seconds, keeps the
      // connection open until real output starts. Clients ignore unknown types.
      send({ type: "ping" });
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "ping" })}\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 10_000);

      try {
        // Custom HTTP (OpenAI-compatible) endpoint branch — lets users experiment with local/custom model APIs
        if (isCustomHttp && customEntry) {
          send({
            type: "meta",
            route: {
              requestedModel,
              selectedModel: customEntry.id,
              category: "custom_endpoint",
              complexity: "custom",
              reason: `Direct request to custom endpoint (${customEntry.endpointUrl})`,
              steps: ["Direct Custom Endpoint"],
            },
          });

          const sys = systemPromptFor(body, []);
          for await (const event of streamOpenAiCompatible({
            model: { id: customEntry.id, endpointUrl: customEntry.endpointUrl, customToken: customEntry.customToken },
            messages: body.messages,
            systemPrompt: sys,
            temperature: body.temperature,
          })) {
            if (event.type === "text" || event.type === "thought") send(event);
          }
          return;
        }

        // Determine whether to run Smart Orchestration or direct fixed model
        const shouldAutoRoute = requestedModel === AUTO_MODEL_ID || Boolean(body.autoRoute);
        let activeModel = requestedModel === AUTO_MODEL_ID ? orchestration.roles.planner || DEFAULT_MODEL : requestedModel;
        const pipelineSteps: string[] = [];

        let category = "direct";
        let complexity = "standard";
        let routeReason = `Selected model: ${activeModel}`;
        let routerUsed: string | undefined;
        let needsCompression = false;
        let allowSubagents = Boolean(orchestration.enableSubagents && body.harness?.enabled);

        if (shouldAutoRoute) {
          const decision = await triagePrompt({
            messages: body.messages,
            attachments: body.attachments,
            orchestration,
          });
          category = decision.category;
          complexity = decision.complexity;
          activeModel = decision.selectedModel;
          routerUsed = decision.routerUsed;
          routeReason = decision.reason;
          needsCompression = decision.needsContextCompression;
          allowSubagents = Boolean(orchestration.enableSubagents && (decision.suggestSubagents || body.harness?.enabled));
          pipelineSteps.push(`Step 1 Triage (${decision.routerUsed}) → ${decision.category}`);
        } else {
          pipelineSteps.push(`Direct Model (${activeModel})`);
        }

        // Step 2 — Context compression (Gemini 3.5 Flash Lite) & staged Memory check (Gemini Embedding 2)
        let compressedBrief: string | null = null;
        if (orchestration.enableContextCompression && (needsCompression || (body.attachments?.some((a) => (a.textContent?.length ?? 0) > 10_000) ?? false))) {
          const compressed = await compressContext({
            messages: body.messages,
            attachments: body.attachments,
            orchestration,
          });
          if (compressed) {
            compressedBrief = compressed.summary;
            pipelineSteps.push(`Step 2 Context (${compressed.modelUsed})`);
            send({ type: "notice", text: `Step 2 · Context brief prepared with ${compressed.modelUsed}.` });
          }
        }
        if (orchestration.embeddingMemoryStandby && activeModel === MEMORY_CONFIG.model) {
          send({
            type: "meta",
            route: {
              requestedModel,
              selectedModel: MEMORY_CONFIG.model,
              category: "memory_standby",
              complexity: "staged",
              reason: "Gemini Embedding 2 is configured and on standby for upcoming vector memory retrieval.",
              steps: ["Staged Embedding Memory"],
            },
          });
          send({
            type: "text",
            text: `**${MEMORY_CONFIG.model}** is registered and configured in \`lib/memory.ts\` for multimodal agent memory embeddings, and is currently kept on standby without active vector indexing.\n\nSwitch to **Smart Auto-Route** or **Gemini 4 Hydrogen** to continue chatting, or inspect orchestration settings in **Config**.`,
          });
          return;
        }

        // Voice / Live-Translate informational fallback when user submits plain text while those models are active
        if (activeModel === "gemini-3.8-live" || activeModel === "gemini-3.5-live-translate-preview") {
          const isTranslate = activeModel === "gemini-3.5-live-translate-preview";
          send({
            type: "notice",
            text: `${activeModel} is optimized for real-time audio (use the microphone button in the composer). Answering your text turn via ${orchestration.roles.planner}.`,
          });
          if (isTranslate) {
            body = {
              ...body,
              systemPrompt: `${body.systemPrompt ? `${body.systemPrompt}\n\n` : ""}Translate the user's message accurately into language code "${orchestration.translateTargetLanguage}".`,
            };
          }
          activeModel = isTranslate ? orchestration.roles.contextFallback : orchestration.roles.planner;
        }

        send({
          type: "meta",
          route: {
            requestedModel,
            selectedModel: activeModel,
            routerModel: routerUsed,
            category,
            complexity,
            reason: routeReason,
            steps: [...pipelineSteps, `Step 3 Execution (${activeModel})`],
          },
        });

        // Step 3 (Long-horizon managed sandbox) — Antigravity via Interactions API with free-tier fallback
        if (activeModel === "antigravity-preview-09-2026") {
          const lastUser = [...body.messages].reverse().find((m) => m.role === "user")?.content ?? "";
          try {
            send({ type: "notice", text: "Step 3 · Invoking Antigravity managed coding agent via Interactions API…" });
            const res = await runAntigravityInteraction({
              prompt: lastUser,
              systemPrompt: systemPromptFor(body, [], compressedBrief),
              agentModel: orchestration.roles.planner || "gemini-4-hydrogen",
            });
            if (res.thoughts) send({ type: "thought", text: res.thoughts });
            if (res.text) {
              send({ type: "text", text: res.text });
              return;
            }
          } catch (err) {
            if (!isApiKeyInvalidError(err)) {
              const fallbackModel = orchestration.roles.planner || DEFAULT_MODEL;
              send({
                type: "notice",
                text: `Antigravity (${activeModel}) unavailable in this tier/environment; fell back seamlessly to ${fallbackModel}.`,
              });
              activeModel = fallbackModel;
              send({
                type: "meta",
                route: {
                  requestedModel,
                  selectedModel: activeModel,
                  routerModel: routerUsed,
                  category,
                  complexity,
                  reason: `${routeReason} (fallback → ${activeModel})`,
                  steps: [...pipelineSteps, `Step 3 Fallback (${activeModel})`],
                },
              });
            } else {
              throw err;
            }
          }
        }

        const { tools, errors } = servers.length ? await listAllTools(servers) : { tools: [], errors: [] };
        for (const failure of errors) {
          send({ type: "notice", text: `MCP server "${failure.server}" could not be reached: ${failure.message}` });
        }

        const allSkills = await listSkills();
        const enabledSlugs = body.repoSkills;
        const activeSkills = enabledSlugs?.length
          ? allSkills.filter((skill) => enabledSlugs.includes(skill.slug))
          : allSkills;

        // One budget per request, so a turn can jot at most a handful of lines.
        const jotBudget: JotBudget = { used: 0 };
        const memoryOn = body.memory?.enabled !== false && body.memory?.paused !== true;

        const declarations = [
          ...(memoryOn ? MEMORY_TOOL_DECLARATIONS : []),
          ...toFunctionDeclarations(tools),
          ...(activeSkills.length ? SKILL_TOOL_DECLARATIONS : []),
          ...(allowSubagents ? [SUBAGENT_TOOL_DECLARATION] : []),
        ];

        if (declarations.length && !/^gemma-/i.test(activeModel)) {
          send({ type: "notice", text: `Tools available: ${declarations.map((d) => d.name).join(", ")}` });
        }

        const contents: Content[] = toContents(body.messages);
        const seenResults: { ok: boolean; content: string }[] = [];
        const orchestrationInstruction = allowSubagents
          ? `Orchestration active (${category}): For complex coding/multi-part tasks, output a concise plan and call "${SUBAGENT_TOOL_NAME}" to delegate focused sub-edits, unit tests, docstrings, or JSON extraction in parallel to Gemma 4 (26B/31B) or Gemini 3.5 Flash Lite before synthesizing your final answer.`
          : undefined;

        const systemPrompt = systemPromptFor(body, activeSkills, compressedBrief, orchestrationInstruction, tools);

        for (let step = 0; step < maxSteps; step++) {
          const calls: { id?: string; name: string; args: Record<string, unknown> }[] = [];
          const rawCallParts: Part[] = [];

          for await (const event of streamGemini({
            model: activeModel,
            contents,
            systemPrompt,
            temperature: body.temperature,
            declarations,
            customModels: body.customModels,
            // Answer quickly for easy questions; save deep thinking for hard ones.
            thinkingLevel: complexity === "simple" ? "low" : complexity === "complex" ? "high" : "medium",
            onNotice: (text) => send({ type: "notice", text }),
            onFallbackModel: (resolved) => {
              activeModel = resolved;
              send({
                type: "meta",
                route: {
                  requestedModel,
                  selectedModel: resolved,
                  routerModel: routerUsed,
                  category,
                  complexity,
                  reason: `${routeReason} (fallback → ${resolved})`,
                  steps: [...pipelineSteps, `Fallback (${resolved})`],
                },
              });
            },
          })) {
            if (event.type === "modelPart") {
              rawCallParts.push(event.part);
            } else if (event.type === "functionCall") {
              calls.push({ id: event.id, name: event.name, args: event.args });
            } else {
              send(event);
            }
          }

          if (!calls.length) break;

          contents.push({
            role: "model",
            parts: rawCallParts.length
              ? rawCallParts
              : calls.map((call) => ({ functionCall: { name: call.name, args: call.args } })),
          });

          const responseParts: Part[] = [];
          for (const [index, call] of calls.entries()) {
            const id = call.id || `call_${step}_${index}`;

            if (call.name === SUBAGENT_TOOL_NAME) {
              const rawTasks = Array.isArray((call.args as { tasks?: unknown }).tasks)
                ? ((call.args as { tasks: Array<{ title?: string; worker?: string; instruction?: string }> }).tasks).slice(0, 4)
                : [];
              send({
                type: "tool_call",
                id,
                server: "subagents",
                name: `${SUBAGENT_TOOL_NAME} (${rawTasks.length})`,
                args: call.args,
              });

              const settled = await Promise.all(
                rawTasks.map(async (task) => {
                  const res = await runSubagentTask({
                    worker: task.worker || "fast",
                    title: task.title || "Subtask",
                    instruction: task.instruction || "",
                    roles: orchestration.roles,
                  });
                  return { title: task.title || "Subtask", worker: task.worker || "fast", ...res };
                }),
              );

              const combinedContent = settled
                .map((s) => `### ${s.title} [${s.modelUsed}]\n${s.output}`)
                .join("\n\n");

              send({
                type: "tool_result",
                id,
                ok: settled.length > 0,
                content: combinedContent.slice(0, 4000),
              });

              responseParts.push({
                functionResponse: {
                  id: call.id,
                  name: call.name,
                  response: { results: settled },
                },
              });
              continue;
            }

            if (isMemoryTool(call.name)) {
              send({ type: "tool_call", id, server: "memory", name: call.name, args: call.args });
              const result = runMemoryTool(call.name, call.args, jotBudget);
              send({ type: "tool_result", id, ok: result.ok, content: result.content, error: result.error });
              responseParts.push({
                functionResponse: {
                  id: call.id,
                  name: call.name,
                  response: result.ok
                    ? { result: result.content.slice(0, 2000) }
                    : { error: result.error ?? "jot failed" },
                },
              });
              continue;
            }

            const skillCall = isSkillTool(call.name);
            const owner = tools.find((tool) => tool.qualified === call.name);
            const serverName = skillCall ? "skill" : owner?.server ?? "unknown";
            const preapproved = (body.preapprovedServers ?? []).includes(serverName);
            // Skill tools only read files in this repo, so they never pause.
            const needsApproval = !skillCall && !body.harness?.autoApprove && !preapproved;

            send({
              type: "tool_call",
              id,
              server: serverName,
              name: skillCall ? call.name : owner?.name ?? call.name,
              args: call.args,
              awaiting: needsApproval,
            });

            if (needsApproval) {
              const decision = await waitForApproval(id);
              if (!decision.allow) {
                const why = decision.reason ?? "not approved";
                send({ type: "tool_result", id, ok: false, content: "", error: `Not run — ${why}.` });
                responseParts.push({
                  functionResponse: {
                    id: call.id,
                    name: call.name,
                    response: {
                      error: `The user did not approve this call (${why}). Do not retry it; carry on without it or ask what to do instead.`,
                    },
                  },
                });
                continue;
              }
              // Same id, so the card updates in place instead of stacking.
              send({ type: "tool_call", id, server: serverName, name: owner?.name ?? call.name, args: call.args, awaiting: false });
            }

            const result = skillCall
              ? await runSkillTool(call.name, call.args)
              : await callTool(servers, call.name, call.args);
            send({
              type: "tool_result",
              id,
              ok: result.ok,
              content: result.content.slice(0, 4000),
              error: result.error,
            });

            // Hand the model a numbered list of the pages this result added, so
            // its "[n]" markers can be resolved back to real URLs on screen.
            const before = extractSources(seenResults).length;
            seenResults.push({ ok: result.ok, content: result.content.slice(0, 4000) });
            const fresh = extractSources(seenResults).slice(before);
            const numbered = fresh.length
              ? `\n\nNumbered sources (cite as [n]):\n${fresh
                  .map((source) => `[${source.n}] ${source.title} - ${source.url}`)
                  .join("\n")}`
              : "";

            responseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: result.ok
                  ? { result: result.content.slice(0, 8000) + numbered }
                  : { error: result.error ?? "tool failed" },
              },
            });
          }

          contents.push({ role: "user", parts: responseParts });
        }
      } catch (error) {
        let msg = error instanceof Error ? error.message : "Unknown provider error";
        for (let depth = 0; depth < 3; depth++) {
          const trimmed = msg.trim();
          if (!trimmed.startsWith("{")) break;
          try {
            const parsed = JSON.parse(trimmed) as { error?: { message?: string }; message?: string };
            const inner = parsed?.error?.message ?? parsed?.message;
            if (typeof inner === "string" && inner.trim()) msg = inner.trim();
            else break;
          } catch {
            break;
          }
        }
        send({ type: "error", text: msg.slice(0, 400) });
      } finally {
        clearInterval(heartbeat);
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
