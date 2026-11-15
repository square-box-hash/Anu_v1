import { DEFAULT_MODEL } from "../types";
import type { ChatRequest } from "../types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export type StreamEvent = { type: "text" | "thought"; text: string };

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

function buildBody(req: ChatRequest, includeThoughts: boolean) {
  return {
    contents: req.messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    systemInstruction: req.systemPrompt ? { parts: [{ text: req.systemPrompt }] } : undefined,
    generationConfig: {
      temperature: req.temperature ?? 0.7,
      ...(includeThoughts ? { thinkingConfig: { includeThoughts: true } } : {}),
    },
  };
}

function isThinkingRejection(status: number, detail: string): boolean {
  if (status !== 400 && status !== 422) return false;
  return /thinking|thought|unknown name|invalid json payload|not supported/i.test(detail);
}

async function openStream(req: ChatRequest, model: string, apiKey: string, includeThoughts: boolean) {
  const res = await fetch(`${BASE}/${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(buildBody(req, includeThoughts)),
  });
  if (res.ok) return res;
  const detail = await res.text().catch(() => "");
  throw Object.assign(new Error(detail || res.statusText), { status: res.status, detail });
}

/**
 * Streams typed deltas from Gemini's SSE endpoint.
 * Thinking parts are tagged `thought: true` by the API and surfaced separately.
 * If the model rejects thinkingConfig, the request is retried once without it.
 */
export async function* generateStream(req: ChatRequest): AsyncGenerator<StreamEvent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set on the server.");

  const model = req.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const thinkingEnabled = process.env.GEMINI_THINKING !== "0";

  let res: Response;
  try {
    res = await openStream(req, model, apiKey, thinkingEnabled);
  } catch (error) {
    const err = error as { status?: number; detail?: string; message?: string };
    if (thinkingEnabled && isThinkingRejection(err.status ?? 0, err.detail ?? err.message ?? "")) {
      res = await openStream(req, model, apiKey, false);
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
          candidates?: { content?: { parts?: GeminiPart[] } }[];
        };
        const parts = json.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          const text = part.text ?? "";
          if (!text) continue;
          yield part.thought ? { type: "thought", text } : { type: "text", text };
        }
      } catch {
        /* incomplete frame — wait for the rest */
      }
    }
  }
}
