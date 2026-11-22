import type { CustomModelConfig, OrchestrationConfig } from "./models";
export { AUTO_MODEL_ID, DEFAULT_MODEL, MODELS, getAllModels, findModel } from "./models";
export type { ModelEntry, CustomModelConfig, OrchestrationConfig, RoleAssignments, ModelRole } from "./models";

export type Role = "user" | "assistant";

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  textContent?: string;
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
  /** Parked until the person allows it — the call has not reached the server. */
  awaitingApproval?: boolean;
}

export interface RoutingInfo {
  requestedModel: string;
  selectedModel: string;
  routerModel?: string;
  category: string;
  complexity: string;
  reason: string;
  steps?: string[];
}

export interface QuoteRef {
  /** The exact text the user highlighted. */
  text: string;
  /** Message the highlight came from. */
  messageId: string;
  role: Role;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  totalTokens?: number;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  model?: string;
  routing?: RoutingInfo;
  /** Text this message was written in reply to. */
  quote?: QuoteRef;
  /** Token counts reported by the provider for this turn. */
  usage?: Usage;
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
  /** The one line that rides in the system prompt every turn. */
  description: string;
  /** The full instructions: steps, do/don't, examples. Sent with the rule. */
  rules?: string;
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
  /** Per-server guidance for the model, e.g. "always search the city name too". */
  instructions?: string;
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

export interface RepoSkill {
  slug: string;
  name: string;
  description: string;
  files: string[];
}

export interface Settings {
  model: string;
  temperature: number;
  systemPrompt: string;
  autoRoute: boolean;
  orchestration: OrchestrationConfig;
  customModels: CustomModelConfig[];
}

export interface ChatRequest {
  messages: { role: Role; content: string }[];
  model: string;
  autoRoute?: boolean;
  systemPrompt?: string;
  temperature?: number;
  attachments?: { name: string; type: string; size: number; textContent?: string }[];
  /** A bare string is an old one-liner; an object carries its rules too. */
  skills?: (string | { name: string; description?: string; rules?: string })[];
  /** Slugs of workspace skills the user has enabled. */
  repoSkills?: string[];
  mcpServers?: {
    id: string;
    name: string;
    transport: McpTransport;
    target: string;
    headers?: Record<string, string>;
    /** Free-text guidance for the model, written by the user per server. */
    instructions?: string;
  }[];
  harness?: { enabled: boolean; agentMode: boolean; maxSteps: number; autoApprove?: boolean };
  /** Servers this chat has said "always allow" for; they skip the pause. */
  preapprovedServers?: string[];
  orchestration?: OrchestrationConfig;
  customModels?: CustomModelConfig[];
}
