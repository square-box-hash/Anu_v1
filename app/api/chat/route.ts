import { NextResponse } from "next/server";
import { streamGemini, toContents, toFunctionDeclarations } from "@/lib/providers/gemini";
import type { Content, Part } from "@/lib/providers/gemini";
import { callTool, listAllTools } from "@/lib/mcp";
import { SKILL_TOOL_DECLARATIONS, SKILL_TOOL_NAMES, listSkills, runSkillTool } from "@/lib/skills";
import type { McpServerConfig } from "@/lib/mcp";
import type { ChatRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Event =
  | { type: "text"; text: string }
  | { type: "thought"; text: string }
  | { type: "notice"; text: string }
  | { type: "tool_call"; id: string; server: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; ok: boolean; content: string; error?: string }
  | { type: "error"; text: string };

const isSkillTool = (name: string) => (SKILL_TOOL_NAMES as readonly string[]).includes(name);

function systemPromptFor(body: ChatRequest, skills: { name: string; description: string }[]): string {
  const blocks: string[] = [];
  if (body.systemPrompt?.trim()) blocks.push(body.systemPrompt.trim());

  if (skills.length) {
    blocks.push(
      `Skills available in this workspace:\n${skills
        .map((skill) => `- ${skill.name}: ${skill.description}`)
        .join("\n")}\nCall load_skill(name) to read a skill before doing work it covers, and read_skill_file(skill, path) for its supporting files.`,
    );
  }

  if (body.skills?.length) {
    blocks.push(`Inline instructions from the user — follow these when they apply:\n${body.skills.map((s) => `- ${s}`).join("\n")}`);
  }

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

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY is not set on the server. Add it to .env.local (or your Vercel env vars) and redeploy.",
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
    }));

  const encoder = new TextEncoder();
  const maxSteps = Math.min(Math.max(body.harness?.maxSteps ?? 6, 1), 12);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        const { tools, errors } = servers.length
          ? await listAllTools(servers)
          : { tools: [], errors: [] };

        for (const failure of errors) {
          send({ type: "notice", text: `MCP server "${failure.server}" could not be reached: ${failure.message}` });
        }

        const allSkills = await listSkills();
        const enabledSlugs = body.repoSkills;
        const activeSkills = enabledSlugs?.length
          ? allSkills.filter((skill) => enabledSlugs.includes(skill.slug))
          : allSkills;

        const declarations = [
          ...toFunctionDeclarations(tools),
          ...(activeSkills.length ? SKILL_TOOL_DECLARATIONS : []),
        ];
        if (declarations.length) {
          send({ type: "notice", text: `Tools available: ${declarations.map((d) => d.name).join(", ")}` });
        }

        const contents: Content[] = toContents(body.messages);
        const systemPrompt = systemPromptFor(body, activeSkills);

        for (let step = 0; step < maxSteps; step++) {
          const calls: { name: string; args: Record<string, unknown> }[] = [];

          for await (const event of streamGemini({
            model: body.model,
            contents,
            systemPrompt,
            temperature: body.temperature,
            declarations,
          })) {
            if (event.type === "functionCall") {
              calls.push({ name: event.name, args: event.args });
            } else {
              send(event);
            }
          }

          if (!calls.length) break;

          const modelParts: Part[] = calls.map((call) => ({
            functionCall: { name: call.name, args: call.args },
          }));
          contents.push({ role: "model", parts: modelParts });

          const responseParts: Part[] = [];
          for (const [index, call] of calls.entries()) {
            const id = `call_${step}_${index}`;
            const skillCall = isSkillTool(call.name);
            const owner = tools.find((tool) => tool.qualified === call.name);
            send({
              type: "tool_call",
              id,
              server: skillCall ? "skill" : owner?.server ?? "unknown",
              name: skillCall ? call.name : owner?.name ?? call.name,
              args: call.args,
            });

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

            responseParts.push({
              functionResponse: {
                name: call.name,
                response: result.ok
                  ? { result: result.content.slice(0, 8000) }
                  : { error: result.error ?? "tool failed" },
              },
            });
          }

          contents.push({ role: "user", parts: responseParts });
        }
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
