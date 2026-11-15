import type { ChatRequest } from "../types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface ProviderResult {
  text: string;
  model: string;
  usage?: { promptTokens?: number; candidateTokens?: number };
}

/**
 * Google Gemini adapter.
 *
 * This file is the single place the network call lives. It is intentionally
 * left un-wired for now: the UI must run with zero credentials. Fill in the
 * body below (or keep this implementation) and the chat route will start
 * returning real completions.
 */
export async function generate(req: ChatRequest): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const model = req.model || process.env.GEMINI_MODEL || "gemini-2.5-pro";

  const contents = req.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents,
      systemInstruction: req.systemPrompt
        ? { parts: [{ text: req.systemPrompt }] }
        : undefined,
      generationConfig: { temperature: req.temperature ?? 0.7 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini ${res.status}: ${detail.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  return {
    text,
    model,
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount,
      candidateTokens: data.usageMetadata?.candidatesTokenCount,
    },
  };
}

export function isConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}
