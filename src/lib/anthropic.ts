// Anthropic SDK client singleton.

import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY tidak diset di .env.local. Diperlukan untuk parser learner.");
  }
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export function getParserModel(): string {
  return process.env.PARSER_LLM_MODEL ?? "claude-haiku-4-5-20251001";
}

export function getParserMaxTokens(): number {
  return Number(process.env.PARSER_LLM_MAX_TOKENS ?? 8000);
}

// Harga per 1M token (Haiku 4.5 default — bisa di-override via env)
const HAIKU_INPUT_PER_M = 0.80;
const HAIKU_OUTPUT_PER_M = 4.00;

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Untuk Haiku family
  if (model.includes("haiku")) {
    return (inputTokens / 1_000_000) * HAIKU_INPUT_PER_M
         + (outputTokens / 1_000_000) * HAIKU_OUTPUT_PER_M;
  }
  // Sonnet (rough)
  if (model.includes("sonnet")) {
    return (inputTokens / 1_000_000) * 3.0
         + (outputTokens / 1_000_000) * 15.0;
  }
  // Default conservative
  return (inputTokens / 1_000_000) * 3.0
       + (outputTokens / 1_000_000) * 15.0;
}
