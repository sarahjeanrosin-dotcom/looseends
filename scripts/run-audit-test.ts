// Stage 3 CLI test script: runs the AI relevance pass against a real audit's
// real content items, using the real Anthropic API — but as a dry run (no
// database writes) so prompt/quality iteration doesn't disturb real state.
// Once results look right, use the deployed run-audit-pass function (which
// does persist) to actually run an audit.
//
// Usage:
//   npx tsx scripts/run-audit-test.ts <auditId> [--limit=10] [--concurrency=3]
import "dotenv/config";
import { supabase } from "../netlify/functions/_supabase";
import { anthropic } from "../netlify/functions/_anthropic";
import { buildReleaseContext, evaluateBatch, DEFAULT_MODEL } from "../netlify/functions/_matcher";
import type { Audit, ContentItem } from "../netlify/functions/_types";

function parseArgs(argv: string[]) {
  const [auditId, ...rest] = argv;
  const flags: Record<string, string> = {};
  for (const arg of rest) {
    const match = arg.match(/^--([a-zA-Z]+)=(.+)$/);
    if (match) flags[match[1]] = match[2];
  }
  return { auditId, flags };
}

async function main() {
  const { auditId, flags } = parseArgs(process.argv.slice(2));
  if (!auditId) {
    console.error("Usage: npx tsx scripts/run-audit-test.ts <auditId> [--limit=10] [--concurrency=3]");
    process.exit(1);
  }
  const limit = flags.limit ? Number(flags.limit) : 10;
  const concurrency = flags.concurrency ? Number(flags.concurrency) : 3;

  const { data: audit, error: auditError } = await supabase
    .from("audits")
    .select("*")
    .eq("id", auditId)
    .single<Audit>();
  if (auditError || !audit) {
    console.error("Could not load audit:", auditError?.message ?? "not found");
    process.exit(1);
  }

  const { data: releaseBriefs, error: briefsError } = await supabase
    .from("release_briefs")
    .select("content_text")
    .eq("audit_id", auditId);
  if (briefsError) {
    console.error("Could not load release briefs:", briefsError.message);
    process.exit(1);
  }

  const releaseContext = buildReleaseContext(audit, releaseBriefs ?? []);
  console.log("--- Release context ---");
  console.log(releaseContext);
  console.log();

  const { data: items, error: itemsError } = await supabase
    .from("content_items")
    .select("*")
    .eq("audit_id", auditId)
    .order("created_at", { ascending: true })
    .limit(limit)
    .returns<ContentItem[]>();
  if (itemsError) {
    console.error("Could not load content items:", itemsError.message);
    process.exit(1);
  }
  if (!items || items.length === 0) {
    console.error("This audit has no content items — add SharePoint content or crawl the website first.");
    process.exit(1);
  }

  console.log(`Evaluating ${items.length} content item(s) with model ${DEFAULT_MODEL}, concurrency ${concurrency}`);
  console.log("(dry run — nothing is written to the database)\n");

  const started = Date.now();
  const results = await evaluateBatch(anthropic, releaseContext, items, { concurrency });
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);

  let relevantCount = 0;
  let borderlineCount = 0;
  let errorCount = 0;

  for (const result of results) {
    const item = result.contentItem;
    if (result.error) {
      errorCount++;
      console.log(`✗ ERROR   [${item.source}] ${item.title}\n    ${result.error}\n`);
      continue;
    }
    const v = result.verdict!;
    const borderline = !v.relevant && v.confidence !== "high";
    if (v.relevant) relevantCount++;
    if (borderline) borderlineCount++;
    if (!v.relevant && !borderline) continue; // high-confidence "not relevant" — same as production, not printed

    const tag = v.relevant ? `RELEVANT (lift ${v.lift_score}/5 ${v.lift_label})` : `BORDERLINE (confidence: ${v.confidence})`;
    console.log(`${v.relevant ? "✓" : "?"} ${tag}   [${item.source}] ${item.title}`);
    console.log(`    Reason: ${v.reason}`);
    if (v.suggested_action) console.log(`    Suggested action: ${v.suggested_action}`);
    console.log();
  }

  console.log("--- Summary ---");
  console.log(`Evaluated: ${results.length} in ${elapsedSec}s`);
  console.log(`Relevant: ${relevantCount}`);
  console.log(`Borderline (kept for review): ${borderlineCount}`);
  console.log(`Not relevant, high confidence (dropped): ${results.length - relevantCount - borderlineCount - errorCount}`);
  console.log(`Errors: ${errorCount}`);
}

main().catch((err) => {
  console.error("Audit test script failed:", err);
  process.exit(1);
});
