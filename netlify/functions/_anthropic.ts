// Shared Anthropic client for Netlify Functions and CLI test scripts.
import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.warn(
    "[anthropic] ANTHROPIC_API_KEY is not set. The AI relevance pass will fail until it's configured " +
      "(see .env.example)."
  );
}

// A bit above the SDK default (2) — this runs unattended in batches, so it's
// worth riding out a transient 429/5xx rather than failing an item outright.
// The SDK already retries those automatically; per-item try/catch in
// _matcher.ts handles whatever's left over.
export const anthropic = new Anthropic({ apiKey: apiKey ?? "", maxRetries: 4 });
