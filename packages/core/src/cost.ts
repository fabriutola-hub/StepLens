// ── Model Pricing Database ───────────────────────────────────────────────────
// Prices are per 1,000 tokens, in USD (decimal dollars — never cents).
//
// IMPORTANT: this table is STATIC and hand-maintained. It is a snapshot of
// public pricing pages as of mid-2025 and WILL drift as providers change
// prices or release new models. Treat every cost as a rough ESTIMATE, not a
// billing figure. Unknown models simply return no cost (undefined).

interface PricingEntry {
  inputPer1k: number;
  outputPer1k: number;
}

const PRICING: Record<string, PricingEntry> = {
  // ── OpenAI ───────────────────────────────────────────────────────────────
  "gpt-4o": { inputPer1k: 0.0025, outputPer1k: 0.01 },
  "gpt-4o-2024-11-20": { inputPer1k: 0.0025, outputPer1k: 0.01 },
  "gpt-4o-2024-08-06": { inputPer1k: 0.0025, outputPer1k: 0.01 },
  "gpt-4o-mini": { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  "gpt-4o-mini-2024-07-18": { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  "gpt-4.1": { inputPer1k: 0.002, outputPer1k: 0.008 },
  "gpt-4.1-mini": { inputPer1k: 0.0004, outputPer1k: 0.0016 },
  "gpt-4.1-nano": { inputPer1k: 0.0001, outputPer1k: 0.0004 },
  "o1": { inputPer1k: 0.015, outputPer1k: 0.06 },
  "o1-mini": { inputPer1k: 0.003, outputPer1k: 0.012 },
  "o3": { inputPer1k: 0.01, outputPer1k: 0.04 },
  "o3-mini": { inputPer1k: 0.0015, outputPer1k: 0.006 },
  "o4-mini": { inputPer1k: 0.0011, outputPer1k: 0.0044 },

  // ── Anthropic ────────────────────────────────────────────────────────────
  "claude-4-opus-20250514": { inputPer1k: 0.015, outputPer1k: 0.075 },
  "claude-4-sonnet-20250514": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "claude-3-7-sonnet-20250219": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "claude-3-5-sonnet-20241022": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "claude-3-5-sonnet-20240620": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "claude-3-5-haiku-20241022": { inputPer1k: 0.0008, outputPer1k: 0.004 },
  "claude-3-opus-20240229": { inputPer1k: 0.015, outputPer1k: 0.075 },
  "claude-3-sonnet-20240229": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "claude-3-haiku-20240307": { inputPer1k: 0.00025, outputPer1k: 0.00125 },

  // ── Google ───────────────────────────────────────────────────────────────
  "gemini-2.5-pro": { inputPer1k: 0.00125, outputPer1k: 0.005 },
  "gemini-2.5-flash": { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  "gemini-2.0-flash": { inputPer1k: 0.0001, outputPer1k: 0.0004 },
  "gemini-2.0-flash-lite": { inputPer1k: 0.000075, outputPer1k: 0.0003 },
  "gemini-1.5-pro": { inputPer1k: 0.00125, outputPer1k: 0.005 },
  "gemini-1.5-flash": { inputPer1k: 0.000075, outputPer1k: 0.0003 },
  "gemini-1.5-flash-8b": { inputPer1k: 0.0000375, outputPer1k: 0.00015 },

  // ── Mistral ──────────────────────────────────────────────────────────────
  "mistral-large-latest": { inputPer1k: 0.002, outputPer1k: 0.006 },
  "mistral-small-latest": { inputPer1k: 0.0001, outputPer1k: 0.0003 },
  "codestral-latest": { inputPer1k: 0.0003, outputPer1k: 0.0009 },

  // ── Meta (via common providers) ──────────────────────────────────────────
  "llama-3.1-405b-instruct": { inputPer1k: 0.003, outputPer1k: 0.003 },
  "llama-3.1-70b-instruct": { inputPer1k: 0.0004, outputPer1k: 0.0004 },
  "llama-3.1-8b-instruct": { inputPer1k: 0.0001, outputPer1k: 0.0001 },
};

// ── Fuzzy matching cache ─────────────────────────────────────────────────────
const cache = new Map<string, PricingEntry | null>();

/**
 * Normalize a model string for fuzzy matching.
 * Strips date suffixes, lowercases, and removes common noise.
 */
function normalizeModelName(model: string): string {
  return model
    .toLowerCase()
    .trim()
    // Remove date suffixes like -20240620, -2024-08-06, -latest
    .replace(/[-_]?\d{4}[-_]?\d{2}[-_]?\d{2}$/, "")
    .replace(/[-_]?latest$/, "")
    .replace(/[-_]?preview$/, "");
}

/**
 * Look up pricing for a model. Tries exact match first, then fuzzy match
 * by normalizing the model name and stripping version suffixes.
 *
 * Returns null if no pricing data is found.
 */
export function lookupPricing(model: string): PricingEntry | null {
  // Check cache first
  if (cache.has(model)) {
    return cache.get(model) ?? null;
  }

  // Exact match
  if (PRICING[model]) {
    cache.set(model, PRICING[model]!);
    return PRICING[model]!;
  }

  // Fuzzy: normalize and try again
  const normalized = normalizeModelName(model);
  if (PRICING[normalized]) {
    cache.set(model, PRICING[normalized]!);
    return PRICING[normalized]!;
  }

  // Fuzzy: try matching against all known models by prefix
  for (const [key, pricing] of Object.entries(PRICING)) {
    const normalizedKey = normalizeModelName(key);
    if (normalized === normalizedKey || normalized.startsWith(normalizedKey) || normalizedKey.startsWith(normalized)) {
      cache.set(model, pricing);
      return pricing;
    }
  }

  // Not found
  cache.set(model, null);
  return null;
}

/**
 * Calculate the estimated cost in USD for a model call.
 *
 * @param model - The model identifier (e.g., "gpt-4o", "claude-3-5-sonnet")
 * @param inputTokens - Number of input/prompt tokens
 * @param outputTokens - Number of output/completion tokens
 * @returns The estimated cost in USD, or undefined if pricing is not available
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  const pricing = lookupPricing(model);
  if (!pricing) return undefined;

  const inputCost = (inputTokens / 1000) * pricing.inputPer1k;
  const outputCost = (outputTokens / 1000) * pricing.outputPer1k;

  return inputCost + outputCost;
}

/**
 * Get all known model names with their pricing.
 */
export function getAllPricing(): Record<string, PricingEntry> {
  return { ...PRICING };
}
