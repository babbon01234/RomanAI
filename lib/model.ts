import "server-only";
import OpenAI from "openai";

/**
 * The one place that knows how to reach a chat model.
 *
 * Phase 10 moved off the Anthropic SDK. The key we have is a Hack Club AI
 * gateway key, and that gateway speaks the OpenAI wire format only — the
 * Anthropic `/v1/messages` protocol answers 401 there, so `new Anthropic()`
 * could not have worked against it whatever the base URL.
 *
 * The gateway fronts many providers, so the model is a plain config string
 * rather than something this file decides: `~openai/gpt-mini-latest` and
 * `anthropic/claude-sonnet-5` are both valid values for the same key, and
 * swapping between them is an env edit, not a code change.
 */

const DEFAULT_BASE_URL = "https://ai.hackclub.com/proxy/v1";
const DEFAULT_MODEL = "~openai/gpt-mini-latest";

export function modelName(): string {
  return process.env.AI_MODEL?.trim() || DEFAULT_MODEL;
}

export function isModelConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY?.trim());
}

/**
 * Throws rather than returning null: every caller already checks
 * `isModelConfigured()` first and falls back to rehearsal mode, so reaching
 * here without a key is a bug, not a state to handle.
 */
export function modelClient(): OpenAI {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("AI_API_KEY isn't set. See .env.example.");
  }

  return new OpenAI({
    apiKey,
    baseURL: process.env.AI_BASE_URL?.trim() || DEFAULT_BASE_URL,
  });
}

/**
 * A JSON-schema response format in the shape the OpenAI API wants.
 *
 * `strict: true` is what makes the schema a guarantee rather than a request —
 * the whole answer pipeline reads fields off this object, and Phase 4's
 * hand-off decision rides on `needs_human` being present.
 */
export function jsonSchemaFormat(name: string, schema: Record<string, unknown>) {
  return {
    type: "json_schema" as const,
    json_schema: { name, strict: true, schema },
  };
}
