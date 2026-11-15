import { DEFAULT_MODEL } from "../types";
import type { ChatRequest } from "../types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function buildBody(req: ChatRequest) {
  return {
    contents: req.messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    systemInstruction: req.systemPrompt
      ? { parts: [{ text: req.systemPrompt }] }
      : undefined,
    generationConfig: { temperature: req.temperature ?? 0.7 },
  };
}

/**
 * Streams text deltas from Gemini's SSE endpoint.
 * Model resolution: request model -> GEMINI_MODEL env -> DEFAULT_MODEL.
 */
export async function* generateStream(req: ChatRequest): AsyncGenerator<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set on the server.");

  const model = req.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const res = await fetch(`${BASE}/${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(buildBody(req)),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Gemini ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 400)}` : ""}`,
    );
  }

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
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text =
          json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
        if (text) yield text;
      } catch {
        /* incomplete frame — wait for the rest */
      }
    }
  }
}
