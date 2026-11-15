import { DEFAULT_MODEL } from "../types";
import type { ChatRequest } from "../types";
import type { McpTool } from "../mcp";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export type Part = {
  text?: string;
  thought?: boolean;
  functionCall?: { name?: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
};

export type Content = { role: "user" | "model"; parts: Part[] };

export type GeminiEvent =
  | { type: "text"; text: string }
  | { type: "thought"; text: string }
  | { type: "functionCall"; name: string; args: Record<string, unknown> };

export function toContents(messages: ChatRequest["messages"]): Content[] {
  return messages.map((message) => ({
    role: message.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: message.content }],
  }));
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

export function toFunctionDeclarations(tools: McpTool[]) {
  return tools.map((tool) => ({
    name: tool.qualified,
    description: (tool.description || `${tool.name} (via ${tool.server})`).slice(0, 900),
    parameters: sanitizeSchema(tool.inputSchema),
  }));
}

interface StreamOptions {
  model: string;
  contents: Content[];
  systemPrompt?: string;
  temperature?: number;
  declarations?: ReturnType<typeof toFunctionDeclarations>;
}

function buildBody(options: StreamOptions, includeThoughts: boolean) {
  return {
    contents: options.contents,
    systemInstruction: options.systemPrompt ? { parts: [{ text: options.systemPrompt }] } : undefined,
    tools: options.declarations?.length ? [{ functionDeclarations: options.declarations }] : undefined,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      ...(includeThoughts ? { thinkingConfig: { includeThoughts: true } } : {}),
    },
  };
}

function isThinkingRejection(status: number, detail: string): boolean {
  if (status !== 400 && status !== 422) return false;
  return /thinking|thought|unknown name|invalid json payload|not supported/i.test(detail);
}

async function openStream(options: StreamOptions, apiKey: string, includeThoughts: boolean) {
  const res = await fetch(`${BASE}/${options.model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(buildBody(options, includeThoughts)),
  });
  if (res.ok) return res;
  const detail = await res.text().catch(() => "");
  throw Object.assign(new Error(detail || res.statusText), { status: res.status, detail });
}

/**
 * Streams typed events: answer text, reasoning text, and function calls.
 * Retries once without thinkingConfig if the model rejects it.
 */
export async function* streamGemini(options: StreamOptions): AsyncGenerator<GeminiEvent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set on the server.");

  const model = options.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const thinkingEnabled = process.env.GEMINI_THINKING !== "0";

  let res: Response;
  try {
    res = await openStream({ ...options, model }, apiKey, thinkingEnabled);
  } catch (error) {
    const err = error as { status?: number; detail?: string; message?: string };
    if (thinkingEnabled && isThinkingRejection(err.status ?? 0, err.detail ?? err.message ?? "")) {
      res = await openStream({ ...options, model }, apiKey, false);
    } else {
      throw new Error(`Gemini ${err.status ?? ""} ${err.detail ?? err.message ?? ""}`.trim().slice(0, 500));
    }
  }

  if (!res.body) throw new Error("Gemini returned an empty stream.");

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
          candidates?: { content?: { parts?: Part[] } }[];
        };
        for (const part of json.candidates?.[0]?.content?.parts ?? []) {
          if (part.functionCall?.name) {
            yield {
              type: "functionCall",
              name: part.functionCall.name,
              args: (part.functionCall.args ?? {}) as Record<string, unknown>,
            };
            continue;
          }
          const text = part.text ?? "";
          if (!text) continue;
          yield part.thought ? { type: "thought", text } : { type: "text", text };
        }
      } catch {
        /* incomplete frame */
      }
    }
  }
}
