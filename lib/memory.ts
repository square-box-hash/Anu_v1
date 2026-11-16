import { GoogleGenAI } from "@google/genai";

export const MEMORY_CONFIG = {
  model: "gemini-embedding-2",
  status: "staged" as const,
  description: "Multimodal agent memory embedding helper kept ready for vector recall.",
};

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set on the server.");
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { "User-Agent": "aistudio-build" },
    },
  });
}

export type MemoryEmbedInput =
  | string
  | { inlineData: { data: string; mimeType: string } };

/**
 * Staged Gemini Embedding 2 utility for future agent memory indexing/retrieval.
 * Kept ready per orchestration Step 2 without active invocation on regular chat turns.
 */
export async function embedMemoryChunks(inputs: MemoryEmbedInput[]): Promise<number[][]> {
  if (!inputs.length) return [];
  const ai = getClient();
  const result = await ai.models.embedContent({
    model: MEMORY_CONFIG.model,
    contents: inputs,
  });
  return (result.embeddings ?? []).map((entry) => entry.values ?? []);
}
