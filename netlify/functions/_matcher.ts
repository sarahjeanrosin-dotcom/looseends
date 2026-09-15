// Core AI relevance-matching logic (Stage 3). Given a release context and a
// content item (from the Stage 1 SharePoint upload or the Stage 2 crawler),
// asks Claude whether the content needs updating because of the release.
// Shared by run-audit-pass.ts and scripts/run-audit-test.ts.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Audit, ContentItem, ReleaseBrief } from "./_types";

// Named explicitly per the spec rather than defaulting to the newest model —
// this is a bulk classification workload (many small calls), and Sonnet 4.6
// is a deliberate cost/quality choice for that, not a stand-in for "latest".
export const DEFAULT_MODEL = "claude-sonnet-4-6";

const LIFT_SCALE_TEXT = `1 = Super easy (single word/term swap, no design or review needed)
2 = Easy (a few sentences, no layout change)
3 = Moderate (new section/paragraph, or requires a screenshot/image swap)
4 = Hard (structural change, multiple pages, or needs stakeholder review)
5 = Super hard (full asset rebuild — deck, case study, or page redesign)`;

const RelevanceVerdictSchema = z.object({
  relevant: z
    .boolean()
    .describe("True if this content needs to be updated because of the release."),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "Confidence in the relevant/not-relevant call. Use \"high\" only when you're confident " +
        "it's unrelated to the release; use \"medium\" or \"low\" for closer calls."
    ),
  reason: z.string().describe("1-3 sentence explanation of the verdict."),
  legacy_copy: z
    .string()
    .describe(
      "The exact outdated text, quoted verbatim from the excerpt, that needs to change — " +
        "so someone can find it and replace it directly. Empty string if not relevant, or if " +
        "the issue is an omission (nothing missing to quote) rather than something stated incorrectly."
    ),
  suggested_action: z
    .string()
    .describe("Concrete suggested edit if relevant; empty string if not relevant."),
  lift_score: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe("Effort to make the update, 1-5 per the lift scale. Only meaningful if relevant."),
  lift_label: z.string().describe("Short label matching lift_score, e.g. \"Easy\"."),
});

export type RelevanceVerdict = z.infer<typeof RelevanceVerdictSchema>;

function truncate(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars) + `\n… [truncated, ${trimmed.length - maxChars} more characters]`;
}

// Kept modest — this is context repeated (and prompt-cached) on every one of
// potentially dozens of content-item calls per audit, so cost scales with it.
const RELEASE_CONTEXT_MAX_CHARS = 6000;
const CONTENT_EXCERPT_MAX_CHARS = 4000;

/**
 * Combines release name + description + brief content(s) into one context
 * string. `releaseBriefs` supports the Stage 4 New Audit screen allowing
 * multiple brief/release doc files — their text is concatenated.
 */
export function buildReleaseContext(
  audit: Pick<Audit, "release_name" | "description">,
  releaseBriefs: Pick<ReleaseBrief, "content_text">[] = []
): string {
  const parts = [`Release name: ${audit.release_name}`];
  if (audit.description?.trim()) {
    parts.push(`Description: ${audit.description.trim()}`);
  }
  const briefText = releaseBriefs
    .map((b) => b.content_text?.trim())
    .filter((text): text is string => !!text)
    .join("\n\n---\n\n");
  if (briefText) {
    parts.push(`Product brief content:\n${truncate(briefText, RELEASE_CONTEXT_MAX_CHARS)}`);
  }
  return parts.join("\n\n");
}

function buildSystemPrompt(releaseContext: string): string {
  return `You are helping a marketing team keep their website and SharePoint content evergreen after a product release.

Release context:
${releaseContext}

For each piece of existing content you're shown, decide whether it needs to be updated because of this release — e.g. it describes a feature that changed, omits something new the release adds, uses terminology or numbers the release makes outdated, or states something the release now contradicts. Content that's simply unrelated to the release is not relevant, even if it's about the same general product area.

The person reading your output is often not the one who'll make the edit — they hand a list of findings to whoever owns the actual page or file. So when the issue is something the content currently *says* (not just omits), quote the exact outdated text verbatim in legacy_copy — enough that a search-and-replace would find it — so that person can locate it without re-reading the whole asset themselves.

If relevant, estimate how much work updating it would be using this lift scale:
${LIFT_SCALE_TEXT}

Always set confidence honestly: use "high" only when you're confident the content is unrelated to the release, and "medium" or "low" for closer calls — this is how borderline cases get flagged for human review even when your best guess is "not relevant".`;
}

/** Evaluates one content item against the release context. */
export async function evaluateContentItem(
  client: Anthropic,
  releaseContext: string,
  item: Pick<ContentItem, "title" | "source" | "content_text">,
  model: string = DEFAULT_MODEL
): Promise<RelevanceVerdict> {
  const excerpt = truncate(item.content_text, CONTENT_EXCERPT_MAX_CHARS);

  const response = await client.messages.parse({
    model,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: buildSystemPrompt(releaseContext),
        // The release context is identical across every content item in an
        // audit run — caching it means only the first call (or first per
        // 5-min window) pays full price for it.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Content item to evaluate:\nSource: ${item.source}\nTitle: ${item.title}\n\nExcerpt:\n${excerpt}`,
      },
    ],
    output_config: { format: zodOutputFormat(RelevanceVerdictSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Model response did not parse against the expected schema");
  }
  return response.parsed_output;
}

export interface MatchResult {
  contentItem: ContentItem;
  verdict?: RelevanceVerdict;
  error?: string;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Evaluates a batch of content items with bounded concurrency. Never throws
 * for an individual item's failure — each result carries either a verdict or
 * an error string, so one bad call doesn't take down the whole batch (the
 * SDK's own retry handling already covers transient 429/5xx before this).
 */
export async function evaluateBatch(
  client: Anthropic,
  releaseContext: string,
  items: ContentItem[],
  options: { concurrency?: number; model?: string } = {}
): Promise<MatchResult[]> {
  const concurrency = options.concurrency ?? 3;
  const model = options.model ?? DEFAULT_MODEL;

  return mapWithConcurrency(items, concurrency, async (item) => {
    try {
      const verdict = await evaluateContentItem(client, releaseContext, item, model);
      return { contentItem: item, verdict };
    } catch (err) {
      return { contentItem: item, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
