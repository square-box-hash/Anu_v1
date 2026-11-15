export type Role = "user" | "assistant";

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  attachments?: Attachment[];
  createdAt: number;
  pending?: boolean;
  demo?: boolean;
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
  builtin: boolean;
}

export type McpTransport = "stdio" | "http" | "sse";
export type McpStatus = "connected" | "connecting" | "disconnected" | "error";

export interface McpServer {
  id: string;
  name: string;
  transport: McpTransport;
  target: string;
  enabled: boolean;
  status: McpStatus;
  tools: number;
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
  mcpServers?: { name: string; transport: McpTransport; tools: number }[];
  harness?: { enabled: boolean; agentMode: boolean; maxSteps: number };
}

export const MODELS = [
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Deep reasoning" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Fast, balanced" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", hint: "Cheapest" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", hint: "Legacy fast" },
] as const;

export const BUILTIN_SKILLS: Omit<Skill, "enabled">[] = [
  { id: "web-research", name: "Web Research", description: "Search, read and cite sources before answering.", builtin: true },
  { id: "code-review", name: "Code Review", description: "Review diffs for bugs, security and style issues.", builtin: true },
  { id: "data-analysis", name: "Data Analysis", description: "Profile tables, run calculations, explain results.", builtin: true },
  { id: "doc-writer", name: "Doc Writer", description: "Draft specs, READMEs and release notes in your voice.", builtin: true },
  { id: "design-critic", name: "Design Critic", description: "Critique UI screenshots against layout and contrast rules.", builtin: true },
];

export const DEMO_SERVERS: McpServer[] = [
  { id: "mcp-filesystem", name: "filesystem", transport: "stdio", target: "npx -y @modelcontextprotocol/server-filesystem ~/work", enabled: true, status: "connected", tools: 11 },
  { id: "mcp-github", name: "github", transport: "http", target: "https://api.githubcopilot.com/mcp/", enabled: false, status: "disconnected", tools: 26 },
  { id: "mcp-postgres", name: "postgres", transport: "stdio", target: "npx -y @modelcontextprotocol/server-postgres", enabled: false, status: "disconnected", tools: 4 },
];
