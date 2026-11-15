import { NextResponse } from "next/server";
import { listServerTools } from "@/lib/mcp";
import type { McpServerConfig } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lists the tools a single MCP server exposes. */
export async function POST(request: Request) {
  let body: { server?: McpServerConfig };
  try {
    body = (await request.json()) as { server?: McpServerConfig };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const server = body.server;
  if (!server?.target) {
    return NextResponse.json({ error: "server.target is required" }, { status: 400 });
  }

  try {
    const tools = await listServerTools(server);
    return NextResponse.json({
      ok: true,
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 200 },
    );
  }
}
