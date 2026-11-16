export const AUTO_MODEL_ID = "auto";
export const DEFAULT_MODEL = "gemini-4-hydrogen";

export type ModelModality = "orchestrator" | "text" | "agent" | "live" | "live_translate" | "embedding";

export type ModelRole =
  | "router"
  | "planner"
  | "heavy"
  | "context"
  | "subagent_fast"
  | "subagent_quality"
  | "specialist"
  | "long_horizon"
  | "voice"
  | "translate"
  | "memory"
  | "general";

export interface ModelEntry {
  id: string;
  label: string;
  hint: string;
  role: ModelRole;
  modality: ModelModality;
  provider: "gemini" | "openai-compatible";
  badge?: string;
  fallbackId?: string;
  selectiveOnly?: boolean;
  isGemma?: boolean;
  noTemperature?: boolean;
  thinkingSeries?: "gemini4" | "gemini3";
  requiresPaidKey?: boolean;
  staged?: boolean;
  endpointUrl?: string;
  customToken?: string;
}

export interface CustomModelConfig {
  id: string;
  label: string;
  provider: "gemini" | "openai-compatible";
  role: ModelRole;
  endpointUrl?: string;
  customToken?: string;
  hint?: string;
}

export interface RoleAssignments {
  router: string;
  context: string;
  contextFallback: string;
  planner: string;
  heavy: string;
  longHorizon: string;
  subagentFast: string;
  subagentQuality: string;
  casualChat: string;
  specialist: string;
  voice: string;
  translate: string;
  memory: string;
}

export interface OrchestrationConfig {
  enableContextCompression: boolean;
  enableSubagents: boolean;
  enableFirstPromptFocus: boolean;
  embeddingMemoryStandby: boolean;
  translateTargetLanguage: string;
  roles: RoleAssignments;
}

export const TRANSLATE_LANGUAGES: { code: string; label: string }[] = [
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Mandarin" },
  { code: "pt", label: "Portuguese" },
  { code: "ar", label: "Arabic" },
  { code: "it", label: "Italian" },
];

export const DEFAULT_ROLE_ASSIGNMENTS: RoleAssignments = {
  router: "gemini-decision-1",
  context: "gemini-3.5-flash-lite",
  contextFallback: "gemini-3.1-flash-lite",
  planner: "gemini-4-hydrogen",
  heavy: "gemini-3.8-flash",
  longHorizon: "antigravity-preview-09-2026",
  subagentFast: "gemma-4-26b-a4b-it",
  subagentQuality: "gemma-4-31b-it",
  casualChat: "gemma-4-31b-it",
  specialist: "gemini-3.6-flash",
  voice: "gemini-3.8-live",
  translate: "gemini-3.5-live-translate-preview",
  memory: "gemini-embedding-2",
};

export const DEFAULT_ORCHESTRATION_CONFIG: OrchestrationConfig = {
  enableContextCompression: true,
  enableSubagents: true,
  enableFirstPromptFocus: true,
  embeddingMemoryStandby: true,
  translateTargetLanguage: "es",
  roles: { ...DEFAULT_ROLE_ASSIGNMENTS },
};

export const BUILTIN_MODELS: ModelEntry[] = [
  {
    id: AUTO_MODEL_ID,
    label: "Smart Auto-Route",
    hint: "4-step router · Decisions 1 → Context → Planner → Subagents",
    role: "router",
    modality: "orchestrator",
    provider: "gemini",
    badge: "Auto",
  },
  {
    id: "gemini-4-hydrogen",
    label: "Gemini 4 Hydrogen",
    hint: "default · fast frontier planner, STEM & deep reasoning",
    role: "planner",
    modality: "text",
    provider: "gemini",
    badge: "Default",
    fallbackId: "gemini-3.8-flash",
    noTemperature: true,
    thinkingSeries: "gemini4",
  },
  {
    id: "gemini-decision-1",
    label: "Gemini Decisions 1",
    hint: "10K RPD · triage, routing & rapid tool calling",
    role: "router",
    modality: "text",
    provider: "gemini",
    badge: "Router",
    fallbackId: "gemini-3.1-flash-lite",
  },
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    hint: "heavy · medium-heavy synthesis & planner fallback",
    role: "heavy",
    modality: "text",
    provider: "gemini",
    badge: "Heavy",
    fallbackId: "gemini-4-hydrogen",
    thinkingSeries: "gemini3",
  },
  {
    id: "gemma-4-31b-it",
    label: "Gemma 4 31B",
    hint: "14.4K RPD · quality subagent, code sub-edits & direct chat",
    role: "subagent_quality",
    modality: "text",
    provider: "gemini",
    badge: "Chat/Sub",
    isGemma: true,
    fallbackId: "gemini-3.1-flash-lite",
  },
  {
    id: "gemma-4-26b-a4b-it",
    label: "Gemma 4 26B",
    hint: "14.4K RPD · ultra-fast subagent, tests & light chat",
    role: "subagent_fast",
    modality: "text",
    provider: "gemini",
    badge: "Fast Sub",
    isGemma: true,
    fallbackId: "gemini-3.1-flash-lite",
  },
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash Lite",
    hint: "250K TPM · reading big files, JSON edits & coding",
    role: "context",
    modality: "text",
    provider: "gemini",
    badge: "Files/JSON",
    fallbackId: "gemini-3.1-flash-lite",
    thinkingSeries: "gemini3",
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    hint: "500 RPD · high-speed lite reader & structured output",
    role: "context",
    modality: "text",
    provider: "gemini",
    badge: "Lite",
    thinkingSeries: "gemini3",
  },
  {
    id: "antigravity-preview-09-2026",
    label: "Antigravity",
    hint: "long-horizon coding agent sandbox · Interactions API",
    role: "long_horizon",
    modality: "agent",
    provider: "gemini",
    badge: "Agent",
    requiresPaidKey: true,
    fallbackId: "gemini-4-hydrogen",
  },
  {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    hint: "selective specialist · targeted tool/analysis (non-chat)",
    role: "specialist",
    modality: "text",
    provider: "gemini",
    badge: "Selective",
    selectiveOnly: true,
    fallbackId: "gemini-4-hydrogen",
    thinkingSeries: "gemini3",
  },
  {
    id: "gemini-3.8-live",
    label: "Gemini 3.8 Live",
    hint: "real-time voice · native bidirectional audio",
    role: "voice",
    modality: "live",
    provider: "gemini",
    badge: "Voice",
  },
  {
    id: "gemini-3.5-live-translate-preview",
    label: "Gemini 3.5 Live Translate",
    hint: "70+ languages · live speech-to-speech translation",
    role: "translate",
    modality: "live_translate",
    provider: "gemini",
    badge: "Translate",
  },
  {
    id: "gemini-embedding-2",
    label: "Gemini Embedding 2",
    hint: "agent memory · vector embeddings configured on standby",
    role: "memory",
    modality: "embedding",
    provider: "gemini",
    badge: "Memory",
    staged: true,
  },
];

function toLabel(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const envExtraModels: ModelEntry[] = (process.env.NEXT_PUBLIC_GEMINI_MODELS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter((id) => id && !BUILTIN_MODELS.some((m) => m.id === id))
  .map((id) => ({
    id,
    label: toLabel(id),
    hint: "env configured",
    role: "general",
    modality: "text",
    provider: "gemini",
  }));

export const MODELS: ModelEntry[] = [...BUILTIN_MODELS, ...envExtraModels];

export function getAllModels(customModels: CustomModelConfig[] = []): ModelEntry[] {
  const customEntries: ModelEntry[] = customModels
    .filter((c) => c.id.trim())
    .map((c) => ({
      id: c.id.trim(),
      label: c.label.trim() || toLabel(c.id.trim()),
      hint:
        c.hint?.trim() ||
        (c.provider === "openai-compatible"
          ? `custom endpoint · ${c.endpointUrl || "openai-compatible"}`
          : `custom Gemini ID · ${c.role}`),
      role: c.role,
      modality: "text",
      provider: c.provider,
      badge: c.provider === "openai-compatible" ? "Custom API" : "Custom",
      endpointUrl: c.endpointUrl,
      customToken: c.customToken,
      isGemma: /^gemma-/i.test(c.id),
      noTemperature: /^gemini-4-/i.test(c.id),
      thinkingSeries: /^gemini-4-/i.test(c.id) ? "gemini4" : /^gemini-3/i.test(c.id) ? "gemini3" : undefined,
    }));

  const deduped = [...MODELS];
  for (const entry of customEntries) {
    const idx = deduped.findIndex((m) => m.id === entry.id);
    if (idx >= 0) deduped[idx] = entry;
    else deduped.push(entry);
  }
  return deduped;
}

export function findModel(id: string, customModels: CustomModelConfig[] = []): ModelEntry | undefined {
  return getAllModels(customModels).find((m) => m.id === id);
}
