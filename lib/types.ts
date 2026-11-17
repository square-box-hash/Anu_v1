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
  skills?: string[];
  /** Slugs of workspace skills the user has enabled. */
  repoSkills?: string[];
  mcpServers?: {
    id: string;
    name: string;
    transport: McpTransport;
    target: string;
    headers?: Record<string, string>;
  }[];
  harness?: { enabled: boolean; agentMode: boolean; maxSteps: number };
  orchestration?: OrchestrationConfig;
  customModels?: CustomModelConfig[];
}
