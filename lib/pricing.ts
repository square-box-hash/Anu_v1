import type { Usage } from "./types";

/**
 * Per-million-token list prices, in USD.
 *
 * Only models with a price you can point at in the provider's own docs belong
 * here. An unpriced model is not a bug: the meter shows tokens and says the cost
 * is unknown rather than inventing a number. Add entries as you confirm them.
 */
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  /** Where the number came from, so a stale entry is obvious. */
  source?: string;
}

export const PRICING: Record<string, ModelPricing> = {
  // Google's published Gemini 4 Hydrogen standard tier.
  "gemini-4-hydrogen": {
    inputPerMTok: 1.5,
    outputPerMTok: 7.5,
    source: "Google price list, standard tier",
  },
};

export function pricingFor(model?: string | null): ModelPricing | null {
  if (!model) return null;
  return PRICING[model] ?? null;
}

/** Cost of one turn, or null when the model has no price on record. */
export function estimateCost(model: string | null | undefined, usage?: Usage | null): number | null {
  const price = pricingFor(model);
  if (!price || !usage) return null;

  const input = usage.inputTokens ?? 0;
  // Thinking tokens are billed as output.
  const output = (usage.outputTokens ?? 0) + (usage.thoughtTokens ?? 0);
  if (!input && !output) return null;

  return (input / 1_000_000) * price.inputPerMTok + (output / 1_000_000) * price.outputPerMTok;
}

export function formatTokens(count?: number): string {
  if (count == null) return "—";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

export function formatCost(usd: number | null): string {
  if (usd == null) return "cost n/a";
  if (usd === 0) return "$0";
  if (usd < 0.0001) return "<$0.0001";
  return `$${usd.toFixed(4)}`;
}
