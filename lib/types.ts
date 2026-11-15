export type Role = "user" | "assistant";

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface ToolCall {
  id: string;
  server: string;
  name: string;
  args: unknown;
  ok?: boolean;
  content?: string;
  error?: string;
  pending?: boolean;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  toolCalls?: ToolCall[];
  notices?: string[];
  /** Reasoning tokens, when the model returns them. */
  thinking?: string;
  attachments?: Attachment[];
  createdAt: number;
  pending?: boolean;
  error?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export type McpTransport = "stdio" | "http" | "sse";
export type McpStatus = "connected" | "connecting" | "disconnected" | "error";

export interface McpServer {
  id: string;
  name: string;
  transport: McpTransport;
  target: string;
  headers?: Record<string, string>;
  enabled: boolean;
  status: McpStatus;
  /** Tool names reported by the server, filled in after a check. */
  tools?: string[];
  error?: string;
}

export interface HarnessConfig {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  agentMode: boolean;
  autoApprove: boolean;
  maxSteps: number;
  status: "idle" | "connecting" | "connected" | "error";
  subagents: string[];
}

export interface Settings {
  model: string;
  temperature: number;
  systemPrompt: string;
}

export interface ChatRequest {
  messages: { role: Role; content: string }[];
  model: string;
  systemPrompt?: string;
  temperature?: number;
  attachments?: { name: string; type: string; size: number }[];
  skills?: string[];
  mcpServers?: {
    id: string;
    name: string;
    transport: McpTransport;
    target: string;
    headers?: Record<string, string>;
  }[];
  harness?: { enabled: boolean; agentMode: boolean; maxSteps: number };
}

/** The model this workspace ships with. */
export const DEFAULT_MODEL = "gemini-4-hydrogen";

function toLabel(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Model list. Add ids by setting NEXT_PUBLIC_GEMINI_MODELS to a comma
 * separated list at build time, e.g. "gemini-4-hydrogen,gemini-4-hydrogen-pro".
 */
const configured = (process.env.NEXT_PUBLIC_GEMINI_MODELS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export const MODELS: { id: string; label: string; hint: string }[] = (
  configured.length ? configured : [DEFAULT_MODEL]
).map((id, index) => ({ id, label: toLabel(id), hint: index === 0 ? "default" : "" }));
