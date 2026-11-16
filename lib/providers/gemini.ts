import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import type { Content, FunctionDeclaration, Part } from "@google/genai";
import type { McpTool } from "../mcp";
import { DEFAULT_MODEL, DEFAULT_ORCHESTRATION_CONFIG, findModel } from "../models";
import type { ChatRequest, CustomModelConfig, OrchestrationConfig } from "../types";

export type { Content, FunctionDeclaration, Part };

export type GeminiEvent =
  | { type: "text"; text: string }
  | { type: "thought"; text: string }
  | { type: "modelPart"; part: Part }
  | { type: "functionCall"; id?: string; name: string; args: Record<string, unknown> };

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set on the server.");
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

export function toContents(messages: ChatRequest["messages"]): Content[] {
  const out: Content[] = [];
  for (const message of messages) {
    const text = message.content?.trim() ?? "";
    if (!text) continue;
    const role = message.role === "assistant" ? ("model" as const) : ("user" as const);
    const prev = out[out.length - 1];
    if (prev && prev.role === role) {
      prev.parts = [...(prev.parts ?? []), { text }];
    } else {
      out.push({ role, parts: [{ text }] });
    }
  }
  if (out.length === 0) {
    out.push({ role: "user", parts: [{ text: "Please review the attached file(s)." }] });
  }
  return out;
}

/** Gemini accepts a subset of JSON Schema — strip anything it rejects. */
function sanitizeSchema(schema: unknown, depth = 0): Record<string, unknown> {
  const source = (schema ?? {}) as Record<string, unknown>;
  if (depth > 6) return { type: "string" };

  const rawType = source.type;
  const type =
    typeof rawType === "string"
      ? rawType
      : Array.isArray(rawType)
        ? (rawType.find((value) => value !== "null") as string | undefined)
        : undefined;

  const out: Record<string, unknown> = {
    type: ["object", "array", "string", "number", "integer", "boolean"].includes(type ?? "")
      ? type
      : "object",
  };

  if (typeof source.description === "string") out.description = source.description.slice(0, 500);

  if (out.type === "object") {
    const properties = (source.properties ?? {}) as Record<string, unknown>;
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) mapped[key] = sanitizeSchema(value, depth + 1);
    out.properties = mapped;
    if (Array.isArray(source.required) && source.required.length) {
      out.required = source.required.filter((key): key is string => typeof key === "string");
    }
  }

  if (out.type === "array") out.items = sanitizeSchema(source.items, depth + 1);

  if (Array.isArray(source.enum) && source.enum.length) {
    out.type = "string";
    out.enum = source.enum.map((value) => String(value));
    delete out.properties;
  }

  return out;
}

export function toFunctionDeclarations(tools: McpTool[]): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.qualified,
    description: (tool.description || `${tool.name} (via ${tool.server})`).slice(0, 900),
    parametersJsonSchema: sanitizeSchema(tool.inputSchema),
  }));
}

export const SUBAGENT_TOOL_NAME = "dispatch_subagents";

export const SUBAGENT_TOOL_DECLARATION: FunctionDeclaration = {
  name: SUBAGENT_TOOL_NAME,
  description:
    "Delegate focused coding, testing, docstring, JSON extraction, or verification subtasks in parallel to specialized smaller models (Gemma 4 26B/31B, Gemini 3.5 Flash Lite, or Gemini 3.6 Flash). Keep each subtask prompt concise (<4K tokens).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      tasks: {
        type: Type.ARRAY,
        description: "1 to 4 parallel subtasks to execute.",
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Short subtask title." },
            worker: {
              type: Type.STRING,
              description:
                "Worker profile: 'fast' (Gemma 4 26B: tests/lint/formatting), 'quality' (Gemma 4 31B: code sub-edits/docstrings), 'extract' (Gemini 3.5 Flash Lite: JSON/log/file extraction), 'selective' (Gemini 3.6 Flash: targeted verification).",
            },
            instruction: {
              type: Type.STRING,
              description: "Self-contained prompt and minimal code/data snippet for this subtask.",
            },
          },
          required: ["title", "worker", "instruction"],
        },
      },
    },
    required: ["tasks"],
  },
};

function isGemini4(model: string): boolean {
  return /^gemini-4-/i.test(model);
}

function isGemini3Or4(model: string): boolean {
  return /^gemini-[34]/i.test(model) && !/live|tts|transcribe|embedding|image/i.test(model);
}

function isGemma(model: string): boolean {
  return /^gemma-/i.test(model);
}

function extractErrorDetail(error: unknown): { status: number; message: string } {
  const err = error as { status?: number; code?: number; message?: string };
  const msg = err?.message ?? String(error ?? "");
  const status = typeof err?.status === "number" ? err.status : typeof err?.code === "number" ? err.code : 0;
  return { status, message: msg };
}

export function isApiKeyInvalidError(error: unknown): boolean {
  const { message } = extractErrorDetail(error);
  return /API_KEY_INVALID|API key not valid|API_KEY_HTTP_REFERRER_BLOCKED|GEMINI_API_KEY is not set/i.test(message);
}

export function isPaidTierOrQuotaError(error: unknown): boolean {
  const { status, message } = extractErrorDetail(error);
  return status === 403 || status === 429 || /PERMISSION_DENIED|RESOURCE_EXHAUSTED|paid|billing|quota/i.test(message);
}

export function isNotFoundError(error: unknown): boolean {
  const { status, message } = extractErrorDetail(error);
  return status === 404 || /NOT_FOUND|not found|is not supported for/i.test(message);
}

function isConfigRejection(error: unknown): boolean {
  const { status, message } = extractErrorDetail(error);
  if (status !== 400 && status !== 422 && status !== 0) return false;
  return /thinking|thought|system|developer|tool|function|unsupported|invalid|not enabled|not supported/i.test(message);
}

export type ThinkingLevelName = "minimal" | "low" | "medium" | "high";

/**
 * Gemini 4 thinks at HIGH unless told otherwise, which can push the first token
 * thirty seconds out — long enough for an idle proxy to drop the connection.
 */
const THINKING_LEVELS: Record<ThinkingLevelName, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

function buildGenerateConfig(
  model: string,
  options: {
    systemPrompt?: string;
    temperature?: number;
    declarations?: FunctionDeclaration[];
    includeThoughts?: boolean;
    includeTools?: boolean;
    thinkingLevel?: ThinkingLevelName;
  },
) {
  const gemma = isGemma(model);
  const g4 = isGemini4(model);
  const supportsThinking = options.includeThoughts && isGemini3Or4(model) && !gemma;

  const config: Record<string, unknown> = {};

  if (!gemma && options.systemPrompt?.trim()) {
    config.systemInstruction = options.systemPrompt.trim();
  }

  // Gemini 4 models disallow deprecated temperature/topP/topK sampling parameters.
  if (!g4 && typeof options.temperature === "number") {
    config.temperature = options.temperature;
  }

  if (options.includeTools && options.declarations?.length) {
    config.tools = [{ functionDeclarations: options.declarations }];
  }

  if (supportsThinking) {
    config.thinkingConfig = g4
      ? { includeThoughts: true, thinkingLevel: THINKING_LEVELS[options.thinkingLevel ?? "high"] }
      : { includeThoughts: true };
  }

  return config;
}

function foldSystemPromptIntoContents(contents: Content[], systemPrompt?: string): Content[] {
  const cleanPrompt = systemPrompt?.trim();
  if (!cleanPrompt) return contents;
  const sysText = `[System Instructions]\n${cleanPrompt}`;
  if (contents.length > 0 && contents[0].role === "user") {
    const first = contents[0];
    return [
      {
        ...first,
        parts: [{ text: sysText }, ...(first.parts ?? [])],
      },
      ...contents.slice(1),
    ];
  }
  return [{ role: "user", parts: [{ text: sysText }] }, ...contents];
}

export interface StreamOptions {
  model: string;
  contents: Content[];
  systemPrompt?: string;
  temperature?: number;
  declarations?: FunctionDeclaration[];
  customModels?: CustomModelConfig[];
  onNotice?: (text: string) => void;
  onFallbackModel?: (model: string) => void;
  /** How hard the model thinks before answering. Lower answers sooner. */
  thinkingLevel?: ThinkingLevelName;
}

/**
 * Streams typed events using @google/genai, respecting per-model parameter constraints
 * and falling back smoothly if a requested experimental model returns 404/429/400.
 */
export async function* streamGemini(options: StreamOptions): AsyncGenerator<GeminiEvent> {
  const ai = getGeminiClient();
  const initialModel = options.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const thinkingEnabled = process.env.GEMINI_THINKING !== "0";

  const entry = findModel(initialModel, options.customModels);
  const candidates: string[] = [];
  for (const id of [initialModel, entry?.fallbackId, DEFAULT_MODEL, "gemini-3.1-flash-lite"]) {
    if (id && !candidates.includes(id)) candidates.push(id);
  }

  let activeError: unknown = null;

  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    const gemma = isGemma(model);
    const attemptContents = gemma ? foldSystemPromptIntoContents(options.contents, options.systemPrompt) : options.contents;

    const attempts: Array<{ includeThoughts: boolean; includeTools: boolean }> = gemma
      ? [{ includeThoughts: false, includeTools: false }]
      : [
          { includeThoughts: thinkingEnabled && isGemini3Or4(model), includeTools: Boolean(options.declarations?.length) },
          { includeThoughts: false, includeTools: Boolean(options.declarations?.length) },
          { includeThoughts: false, includeTools: false },
        ];

    // Deduplicate attempts
    const uniqueAttempts = attempts.filter(
      (a, idx, arr) =>
        arr.findIndex((b) => b.includeThoughts === a.includeThoughts && b.includeTools === a.includeTools) === idx,
    );

    let streamedAnything = false;

    for (const attempt of uniqueAttempts) {
      try {
        const config = buildGenerateConfig(model, {
          systemPrompt: options.systemPrompt,
          temperature: options.temperature,
          declarations: options.declarations,
          includeThoughts: attempt.includeThoughts,
          includeTools: attempt.includeTools,
          thinkingLevel: options.thinkingLevel,
        });

        const responseStream = await ai.models.generateContentStream({
          model,
          contents: attemptContents,
          config,
        });

        if (i > 0 && model !== initialModel) {
          options.onFallbackModel?.(model);
          options.onNotice?.(`Model "${initialModel}" unavailable; fell back to "${model}".`);
        }

        for await (const chunk of responseStream) {
          const parts = chunk.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            if (part.functionCall?.name) {
              yield { type: "modelPart", part };
              yield {
                type: "functionCall",
                id: part.functionCall.id,
                name: part.functionCall.name,
                args: (part.functionCall.args ?? {}) as Record<string, unknown>,
              };
              streamedAnything = true;
              continue;
            }
            const text = part.text ?? "";
            if (!text) continue;
            streamedAnything = true;
            if (part.thought) {
              yield { type: "thought", text };
            } else {
              yield { type: "text", text };
            }
          }
        }
        return;
      } catch (err) {
        activeError = err;
        if (streamedAnything || isApiKeyInvalidError(err)) throw err;
        const hasStrippedAttempt = attempt.includeThoughts || attempt.includeTools;
        if (hasStrippedAttempt && isConfigRejection(err)) continue;
        if (i < candidates.length - 1) {
          break; // try next fallback model
        }
        throw err;
      }
    }
  }

  const { status, message } = extractErrorDetail(activeError);
  throw new Error(`Gemini ${status || ""} ${message}`.trim().slice(0, 500));
}

export async function* streamOpenAiCompatible(options: {
  model: ModelConfigForCustom;
  messages: ChatRequest["messages"];
  systemPrompt?: string;
  temperature?: number;
}): AsyncGenerator<GeminiEvent> {
  const endpoint = options.model.endpointUrl?.trim();
  if (!endpoint) throw new Error(`Custom model "${options.model.id}" is missing an endpoint URL.`);

  const url = endpoint.endsWith("/chat/completions")
    ? endpoint
    : `${endpoint.replace(/\/+$/, "")}/chat/completions`;

  const formatted = [
    ...(options.systemPrompt?.trim() ? [{ role: "system", content: options.systemPrompt.trim() }] : []),
    ...options.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.model.customToken?.trim()) {
    headers.Authorization = `Bearer ${options.model.customToken.trim()}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: options.model.id,
      messages: formatted,
      temperature: options.temperature ?? 0.7,
      stream: true,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Custom API (${res.status}): ${detail.slice(0, 300)}`);
  }

  if (!res.body) throw new Error("Custom endpoint returned an empty stream.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string; reasoning_content?: string } }[];
        };
        const delta = json.choices?.[0]?.delta;
        if (delta?.reasoning_content) yield { type: "thought", text: delta.reasoning_content };
        if (delta?.content) yield { type: "text", text: delta.content };
      } catch {
        /* incomplete SSE chunk */
      }
    }
  }
}

type ModelConfigForCustom = {
  id: string;
  endpointUrl?: string;
  customToken?: string;
};

export type TriageCategory =
  | "casual_chat"
  | "chemistry_stem"
  | "file_json_extraction"
  | "routine_coding"
  | "heavy_architecture"
  | "long_horizon_coding"
  | "selective_analysis"
  | "voice_audio"
  | "translation";

export interface TriageDecision {
  category: TriageCategory;
  complexity: "simple" | "medium" | "heavy" | "long_horizon";
  selectedModel: string;
  routerUsed: string;
  needsContextCompression: boolean;
  suggestSubagents: boolean;
  reason: string;
}

function heuristicTriage(
  firstPrompt: string,
  latestPrompt: string,
  hasLargeContext: boolean,
  orchestration: OrchestrationConfig,
): TriageDecision {
  const combined = `${firstPrompt}\n${latestPrompt}`.toLowerCase();
  const roles = orchestration.roles;

  if (/\b(translate|translation|live translate|speak in|interpret)\b/.test(latestPrompt.toLowerCase())) {
    return {
      category: "translation",
      complexity: "simple",
      selectedModel: roles.contextFallback,
      routerUsed: "heuristic",
      needsContextCompression: false,
      suggestSubagents: false,
      reason: "Detected translation request (switch to Live Translate mic mode for speech-to-speech).",
    };
  }

  if (/\b(voice|speak|audio conversation|talk live)\b/.test(latestPrompt.toLowerCase())) {
    return {
      category: "voice_audio",
      complexity: "simple",
      selectedModel: roles.planner,
      routerUsed: "heuristic",
      needsContextCompression: false,
      suggestSubagents: false,
      reason: "Voice/audio topic detected (use the mic button for Gemini 3.8 Live).",
    };
  }

  if (
    /\b(chemistry|organic chemistry|inorganic|stoichiometry|molarity|enthalpy|thermodynamics|reaction|molecule|acid|base|redox|orbitals|equilibrium|physics|calculus|integral|derivative|theorem|proof)\b/.test(
      combined,
    )
  ) {
    return {
      category: "chemistry_stem",
      complexity: "heavy",
      selectedModel: roles.planner,
      routerUsed: "heuristic",
      needsContextCompression: hasLargeContext,
      suggestSubagents: false,
      reason: "STEM / Chemistry doubt detected from prompt context → routed to frontier reasoning.",
    };
  }

  if (hasLargeContext || /\b(extract json|parse json|structured json|big file|large log|csv|pdf)\b/.test(combined)) {
    return {
      category: "file_json_extraction",
      complexity: "medium",
      selectedModel: roles.context,
      routerUsed: "heuristic",
      needsContextCompression: hasLargeContext,
      suggestSubagents: false,
      reason: "Large context / structured extraction detected → routed to 250K TPM Flash Lite.",
    };
  }

  if (
    /\b(refactor entire|multi-file|long horizon|autonomous|build full|end-to-end app|repository migration|deep debug)\b/.test(
      combined,
    )
  ) {
    return {
      category: "long_horizon_coding",
      complexity: "long_horizon",
      selectedModel: roles.longHorizon,
      routerUsed: "heuristic",
      needsContextCompression: hasLargeContext,
      suggestSubagents: true,
      reason: "Long-horizon software engineering detected → routed to Antigravity / Planner pipeline.",
    };
  }

  if (/\b(architecture|system design|race condition|root cause|bug|debug|typescript|next\.js|react|api)\b/.test(combined)) {
    return {
      category: "heavy_architecture",
      complexity: "heavy",
      selectedModel: roles.planner,
      routerUsed: "heuristic",
      needsContextCompression: hasLargeContext,
      suggestSubagents: true,
      reason: "Engineering planning / debugging detected → Gemini 4 Hydrogen planner with Step 4 subagents.",
    };
  }

  if (/\b(unit test|docstring|lint|format|regex|snippet|helper function|write a function)\b/.test(combined)) {
    return {
      category: "routine_coding",
      complexity: "simple",
      selectedModel: roles.subagentQuality,
      routerUsed: "heuristic",
      needsContextCompression: false,
      suggestSubagents: false,
      reason: "Routine coding task → routed efficiently to Gemma 4 31B.",
    };
  }

  if (latestPrompt.length < 180 && !/\b(code|analyze|audit|compare|proof)\b/.test(combined)) {
    return {
      category: "casual_chat",
      complexity: "simple",
      selectedModel: roles.casualChat,
      routerUsed: "heuristic",
      needsContextCompression: false,
      suggestSubagents: false,
      reason: "Conversational chat → routed to Gemma 4.",
    };
  }

  return {
    category: "heavy_architecture",
    complexity: "medium",
    selectedModel: roles.planner,
    routerUsed: "heuristic",
    needsContextCompression: hasLargeContext,
    suggestSubagents: false,
    reason: "General multi-step task → routed to Gemini 4 Hydrogen.",
  };
}

/** Step 1 — Triage & Routing via Gemini Decisions 1 (with clean fallback to 3.1 Flash Lite & heuristic). */
export async function triagePrompt(input: {
  messages: ChatRequest["messages"];
  attachments?: ChatRequest["attachments"];
  orchestration?: OrchestrationConfig;
}): Promise<TriageDecision> {
  const orchestration = input.orchestration ?? DEFAULT_ORCHESTRATION_CONFIG;
  const roles = orchestration.roles;
  const userMessages = input.messages.filter((m) => m.role === "user");
  const firstPrompt = userMessages[0]?.content ?? "";
  const latestPrompt = userMessages[userMessages.length - 1]?.content ?? "";

  const totalChars = input.messages.reduce((sum, m) => sum + m.content.length, 0);
  const hasLargeAttachments = Boolean(input.attachments?.some((a) => a.size > 40_000 || (a.textContent?.length ?? 0) > 10_000));
  const hasLargeContext = totalChars > 18_000 || hasLargeAttachments;

  const fallback = heuristicTriage(firstPrompt, latestPrompt, hasLargeContext, orchestration);

  const ai = getGeminiClient();
  const routerCandidates = Array.from(new Set([roles.router || "gemini-decision-1", "gemini-3.1-flash-lite"]));

  const triagePromptText = [
    "Classify the user's request for model orchestration.",
    orchestration.enableFirstPromptFocus && firstPrompt && firstPrompt !== latestPrompt
      ? `First conversation prompt (primary domain anchor): ${firstPrompt.slice(0, 600)}`
      : "",
    `Current user message: ${latestPrompt.slice(0, 1200)}`,
    input.attachments?.length
      ? `Attachments: ${input.attachments.map((a) => `${a.name} (${a.type}, ${a.size} bytes)`).join(", ")}`
      : "Attachments: none",
    "Rules:",
    "- 'casual_chat': greetings, casual banter, simple opinions/chat (routes to Gemma 4, never Gemini 3.6 Flash).",
    "- 'chemistry_stem': chemistry doubts, equations, organic/inorganic/physical chemistry, physics, math, STEM problem solving.",
    "- 'file_json_extraction': summarizing large files/logs/PDFs or extracting structured JSON edits.",
    "- 'routine_coding': small edits, unit tests, docstrings, simple scripts.",
    "- 'heavy_architecture': deep coding, tricky debugging, architectural planning, code review.",
    "- 'long_horizon_coding': multi-file autonomous software engineering or full project implementation.",
    "- 'selective_analysis': niche verification or analytical comparison.",
    "- 'voice_audio': explicit request for voice output / spoken conversation.",
    "- 'translation': explicit translation request.",
  ]
    .filter(Boolean)
    .join("\n");

  for (const routerModel of routerCandidates) {
    try {
      const config: Record<string, unknown> = {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            complexity: { type: Type.STRING },
            needsContextCompression: { type: Type.BOOLEAN },
            suggestSubagents: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
          },
          required: ["category", "complexity", "needsContextCompression", "suggestSubagents", "reason"],
        },
      };
      if (!isGemini4(routerModel)) config.temperature = 0.1;

      const res = await ai.models.generateContent({
        model: routerModel,
        contents: triagePromptText,
        config,
      });

      const raw = (res.text ?? "").trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw) as {
        category?: string;
        complexity?: string;
        needsContextCompression?: boolean;
        suggestSubagents?: boolean;
        reason?: string;
      };

      const validCategories: TriageCategory[] = [
        "casual_chat",
        "chemistry_stem",
        "file_json_extraction",
        "routine_coding",
        "heavy_architecture",
        "long_horizon_coding",
        "selective_analysis",
        "voice_audio",
        "translation",
      ];
      const category = validCategories.includes(parsed.category as TriageCategory)
        ? (parsed.category as TriageCategory)
        : fallback.category;

      const validComplexity = ["simple", "medium", "heavy", "long_horizon"].includes(parsed.complexity ?? "")
        ? (parsed.complexity as TriageDecision["complexity"])
        : fallback.complexity;

      let selectedModel = roles.planner;
      switch (category) {
        case "casual_chat":
          selectedModel = latestPrompt.length < 90 ? roles.subagentFast : roles.casualChat;
          break;
        case "chemistry_stem":
          selectedModel = validComplexity === "heavy" ? roles.planner : roles.heavy;
          break;
        case "file_json_extraction":
          selectedModel = roles.context;
          break;
        case "routine_coding":
          selectedModel = roles.subagentQuality;
          break;
        case "heavy_architecture":
          selectedModel = roles.planner;
          break;
        case "long_horizon_coding":
          selectedModel = roles.longHorizon;
          break;
        case "selective_analysis":
          selectedModel = roles.specialist;
          break;
        case "translation":
          selectedModel = roles.contextFallback;
          break;
        case "voice_audio":
          selectedModel = roles.planner;
          break;
      }

      return {
        category,
        complexity: validComplexity,
        selectedModel,
        routerUsed: routerModel,
        needsContextCompression: Boolean(parsed.needsContextCompression || hasLargeContext),
        suggestSubagents: Boolean(
          parsed.suggestSubagents && (category === "heavy_architecture" || category === "long_horizon_coding"),
        ),
        reason: parsed.reason?.trim() || fallback.reason,
      };
    } catch {
      continue;
    }
  }

  return fallback;
}

/** Step 2 — Context Retrieval / Compression via Gemini 3.5 Flash Lite (fallback 3.1 Flash Lite). */
export async function compressContext(input: {
  messages: ChatRequest["messages"];
  attachments?: ChatRequest["attachments"];
  orchestration?: OrchestrationConfig;
}): Promise<{ summary: string; modelUsed: string } | null> {
  const roles = (input.orchestration ?? DEFAULT_ORCHESTRATION_CONFIG).roles;
  const olderMessages = input.messages.slice(0, -1);
  const attachmentTexts = (input.attachments ?? [])
    .filter((a) => a.textContent?.trim())
    .map((a) => `File ${a.name} (${a.size} bytes):\n${a.textContent!.slice(0, 12000)}`);

  if (olderMessages.length < 4 && attachmentTexts.length === 0) return null;

  const digestSource = [
    ...olderMessages.slice(-16).map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 1500)}`),
    ...attachmentTexts,
  ].join("\n\n");

  if (digestSource.length < 3000) return null;

  const ai = getGeminiClient();
  const candidates = Array.from(new Set([roles.context || "gemini-3.5-flash-lite", roles.contextFallback || "gemini-3.1-flash-lite"]));

  for (const model of candidates) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: `Compress this prior conversation history and file snippets into a crisp technical brief preserving key facts, constraints, equations, filenames, and goals:\n\n${digestSource.slice(0, 48000)}`,
        config: { temperature: 0.2 },
      });
      if (res.text?.trim()) {
        return { summary: res.text.trim(), modelUsed: model };
      }
    } catch {
      continue;
    }
  }
  return null;
}

/** Step 3 (Long-Horizon) — Antigravity Agent via Interactions API, reading all model_output steps. */
export async function runAntigravityInteraction(input: {
  prompt: string;
  systemPrompt?: string;
  agentModel?: string;
}): Promise<{ text: string; thoughts: string; stepsCount: number }> {
  const ai = getGeminiClient();
  const combinedInput = input.systemPrompt?.trim()
    ? `${input.systemPrompt.trim()}\n\nUser request:\n${input.prompt}`
    : input.prompt;

  const interaction = await ai.interactions.create(
    {
      agent: "antigravity-preview-09-2026",
      input: combinedInput,
      environment: "remote",
      agent_config: {
        type: "antigravity",
        model: (input.agentModel || "gemini-4-hydrogen") as "gemini-4-hydrogen",
      },
    },
    { timeout: 300000 },
  );

  let fullOutput = "";
  let thoughts = "";
  const steps = Array.isArray(interaction.steps) ? interaction.steps : [];

  for (const step of steps) {
    if (step.type === "thought") {
      const summaryArr = (step as { summary?: Array<{ text?: string }> }).summary;
      const summaryText = Array.isArray(summaryArr)
        ? summaryArr.map((c) => c.text ?? "").join("")
        : "";
      if (summaryText) thoughts += (thoughts ? "\n" : "") + summaryText;
    } else if (step.type === "model_output") {
      const contentArr = (step as { content?: Array<{ type?: string; text?: string }> }).content;
      if (Array.isArray(contentArr)) {
        for (const c of contentArr) {
          if (c.type === "text" && c.text) fullOutput += (fullOutput ? "\n" : "") + c.text;
        }
      }
    }
  }

  if (!fullOutput.trim() && typeof interaction.output_text === "string") {
    fullOutput = interaction.output_text;
  }

  return { text: fullOutput.trim(), thoughts: thoughts.trim(), stepsCount: steps.length };
}

/** Step 4 — Execute a single short-context subagent task (Gemma 4 26B / 31B / 3.5 Flash Lite / 3.6 Flash). */
export async function runSubagentTask(input: {
  worker: string;
  title: string;
  instruction: string;
  roles: OrchestrationConfig["roles"];
}): Promise<{ modelUsed: string; output: string }> {
  const ai = getGeminiClient();
  let primary = input.roles.subagentFast || "gemma-4-26b-a4b-it";
  if (input.worker === "quality") primary = input.roles.subagentQuality || "gemma-4-31b-it";
  else if (input.worker === "extract") primary = input.roles.context || "gemini-3.5-flash-lite";
  else if (input.worker === "selective") primary = input.roles.specialist || "gemini-3.6-flash";

  const candidates = Array.from(new Set([primary, input.roles.contextFallback || "gemini-3.1-flash-lite", DEFAULT_MODEL]));
  // Keep subagent prompts concise (< ~4K tokens / ~14K chars) to respect Gemma 16K TPM limits.
  const clippedPrompt = `Subtask: ${input.title}\n\n${input.instruction.slice(0, 14000)}`;

  for (const model of candidates) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: clippedPrompt,
        config: isGemini4(model) ? undefined : { temperature: 0.3 },
      });
      if (res.text?.trim()) {
        return { modelUsed: model, output: res.text.trim() };
      }
    } catch {
      continue;
    }
  }

  return { modelUsed: primary, output: "Subagent could not complete this subtask." };
}
