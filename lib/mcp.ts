import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { McpTransport } from "./types";

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransport;
  target: string;
  headers?: Record<string, string>;
}

export interface McpTool {
  server: string;
  serverId: string;
  name: string;
  /** Name exposed to the model: serverSlug__toolName */
  qualified: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCallResult {
  ok: boolean;
  content: string;
  error?: string;
}

const clients = new Map<string, Client>();

function signature(server: McpServerConfig): string {
  return JSON.stringify([server.transport, server.target, server.headers ?? {}]);
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "server";
}

/** Splits a shell-ish command line, honouring simple quoting. */
function parseCommand(target: string): { command: string; args: string[] } {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (const char of target.trim()) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  const [command, ...args] = tokens;
  if (!command) throw new Error("stdio server needs a command");
  return { command, args };
}

async function connect(server: McpServerConfig): Promise<Client> {
  const key = signature(server);
  const cached = clients.get(key);
  if (cached) return cached;

  const client = new Client({ name: "anu-chat", version: "1.0.0" }, { capabilities: {} });

  let transport;
  if (server.transport === "stdio") {
    const { command, args } = parseCommand(server.target);
    transport = new StdioClientTransport({ command, args, stderr: "ignore" });
  } else if (server.transport === "sse") {
    transport = new SSEClientTransport(new URL(server.target), {
      requestInit: server.headers ? { headers: server.headers } : undefined,
    });
  } else {
    transport = new StreamableHTTPClientTransport(new URL(server.target), {
      requestInit: server.headers ? { headers: server.headers } : undefined,
    });
  }

  await client.connect(transport);
  clients.set(key, client);
  return client;
}

export async function listServerTools(server: McpServerConfig): Promise<McpTool[]> {
  const client = await connect(server);
  const { tools } = await client.listTools();
  const prefix = slug(server.name);

  return tools.map((tool) => ({
    server: server.name,
    serverId: server.id,
    name: tool.name,
    qualified: `${prefix}__${tool.name}`.slice(0, 64),
    description: tool.description ?? "",
    inputSchema: (tool.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
  }));
}

export interface ToolsResult {
  tools: McpTool[];
  errors: { server: string; message: string }[];
}

export async function listAllTools(servers: McpServerConfig[]): Promise<ToolsResult> {
  const results = await Promise.allSettled(servers.map((server) => listServerTools(server)));
  const tools: McpTool[] = [];
  const errors: { server: string; message: string }[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") tools.push(...result.value);
    else {
      errors.push({
        server: servers[index].name,
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  return { tools, errors };
}

function renderContent(content: unknown): string {
  if (!Array.isArray(content)) return typeof content === "string" ? content : JSON.stringify(content);
  return content
    .map((item) => {
      const part = item as { type?: string; text?: string; mimeType?: string; data?: string };
      if (part.type === "text") return part.text ?? "";
      if (part.type === "image") return `[image ${part.mimeType ?? ""}]`.trim();
      return JSON.stringify(item);
    })
    .filter(Boolean)
    .join("\n");
}

export async function callTool(
  servers: McpServerConfig[],
  qualified: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const owner = servers.find((server) => qualified.startsWith(`${slug(server.name)}__`));
  if (!owner) return { ok: false, content: "", error: `No connected server for tool "${qualified}"` };

  const toolName = qualified.slice(slug(owner.name).length + 2);

  try {
    const client = await connect(owner);
    const result = (await client.callTool({ name: toolName, arguments: args })) as {
      content?: unknown;
      isError?: boolean;
    };
    const text = renderContent(result.content);
    return result.isError ? { ok: false, content: text, error: text } : { ok: true, content: text };
  } catch (error) {
    return {
      ok: false,
      content: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function closeAll(): Promise<void> {
  await Promise.allSettled([...clients.values()].map((client) => client.close()));
  clients.clear();
}
