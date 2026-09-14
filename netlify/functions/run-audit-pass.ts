// POST /.netlify/functions/run-audit-pass
// Processes one chunk of an audit's content_items through the AI relevance
// pass, updates audits.status/progress, and returns whether more work
// remains. Call repeatedly (client-driven polling) until `done: true`.
//
// Kept as a short-lived synchronous function rather than a background
// function or a single long-running job — each invocation only processes a
// small batch, so it stays well inside Netlify's sync function time limit
// regardless of plan tier, and status/progress on `audits` make it safe to
// resume after any single invocation fails or times out.
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";
import { anthropic } from "./_anthropic";
import { buildReleaseContext, evaluateBatch, DEFAULT_MODEL } from "./_matcher";
import type { Audit, ContentItem, Finding, ReleaseBrief } from "./_types";

const DEFAULT_BATCH_SIZE = 6;
const DEFAULT_CONCURRENCY = 3;

interface RequestBody {
  audit_id?: string;
  batch_size?: number;
  concurrency?: number;
  model?: string;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body: RequestBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }
  if (!body.audit_id) {
    return { statusCode: 400, body: JSON.stringify({ error: "audit_id is required" }) };
  }

  const { data: audit, error: auditError } = await supabase
    .from("audits")
    .select("*")
    .eq("id", body.audit_id)
    .single<Audit>();
  if (auditError) {
    return { statusCode: 404, body: JSON.stringify({ error: auditError.message }) };
  }

  const { count: totalItems, error: countError } = await supabase
    .from("content_items")
    .select("*", { count: "exact", head: true })
    .eq("audit_id", body.audit_id);
  if (countError) {
    return { statusCode: 500, body: JSON.stringify({ error: countError.message }) };
  }
  if (!totalItems) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "No content items to evaluate for this audit — add SharePoint content or crawl the website first.",
      }),
    };
  }

  if (audit.status === "pending") {
    await supabase.from("audits").update({ status: "running" }).eq("id", audit.id);
  }

  const batchSize = body.batch_size ?? DEFAULT_BATCH_SIZE;
  const { data: batch, error: batchError } = await supabase
    .from("content_items")
    .select("*")
    .eq("audit_id", body.audit_id)
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(batchSize)
    .returns<ContentItem[]>();
  if (batchError) {
    return { statusCode: 500, body: JSON.stringify({ error: batchError.message }) };
  }

  if (!batch || batch.length === 0) {
    // Nothing left unprocessed — this audit is done.
    await supabase.from("audits").update({ status: "complete", progress: 100 }).eq("id", audit.id);
    return {
      statusCode: 200,
      body: JSON.stringify({ done: true, totalItems, processedItems: totalItems, batchProcessed: 0, findingsCreatedThisBatch: [] }),
    };
  }

  const { data: releaseBriefs, error: briefsError } = await supabase
    .from("release_briefs")
    .select("content_text")
    .eq("audit_id", body.audit_id)
    .returns<Pick<ReleaseBrief, "content_text">[]>();
  if (briefsError) {
    return { statusCode: 500, body: JSON.stringify({ error: briefsError.message }) };
  }

  const releaseContext = buildReleaseContext(audit, releaseBriefs ?? []);
  const results = await evaluateBatch(anthropic, releaseContext, batch, {
    concurrency: body.concurrency ?? DEFAULT_CONCURRENCY,
    model: body.model ?? DEFAULT_MODEL,
  });

  const findingsToInsert: Array<Omit<Finding, "id">> = [];
  for (const result of results) {
    const item = result.contentItem;

    if (result.error) {
      // Surface the failure as a borderline finding rather than silently
      // dropping the item — it still gets marked processed below so it
      // isn't retried forever, but a human can see something went wrong.
      findingsToInsert.push({
        audit_id: item.audit_id,
        content_item_id: item.id,
        source: item.source,
        url_or_path: item.url_or_path,
        title: item.title,
        relevant: false,
        borderline: true,
        reason: `AI evaluation failed: ${result.error}`,
        suggested_action: null,
        lift_score: null,
        lift_label: null,
      });
      continue;
    }

    const v = result.verdict!;
    // Keep every relevant=true item, plus relevant=false items the model
    // wasn't confident about — the "small sample of borderline ones" for
    // review. High-confidence "not relevant" items produce no finding row.
    const borderline = !v.relevant && v.confidence !== "high";
    if (v.relevant || borderline) {
      findingsToInsert.push({
        audit_id: item.audit_id,
        content_item_id: item.id,
        source: item.source,
        url_or_path: item.url_or_path,
        title: item.title,
        relevant: v.relevant,
        borderline,
        reason: v.reason,
        suggested_action: v.suggested_action,
        lift_score: v.relevant ? v.lift_score : null,
        lift_label: v.relevant ? v.lift_label : null,
      });
    }
  }

  let insertedFindings: Finding[] = [];
  if (findingsToInsert.length > 0) {
    const { data, error } = await supabase.from("findings").insert(findingsToInsert).select();
    if (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
    insertedFindings = data ?? [];
  }

  const processedIds = batch.map((item) => item.id);
  const { error: markProcessedError } = await supabase
    .from("content_items")
    .update({ processed: true })
    .in("id", processedIds);
  if (markProcessedError) {
    return { statusCode: 500, body: JSON.stringify({ error: markProcessedError.message }) };
  }

  const { count: processedCount, error: processedCountError } = await supabase
    .from("content_items")
    .select("*", { count: "exact", head: true })
    .eq("audit_id", body.audit_id)
    .eq("processed", true);
  if (processedCountError) {
    return { statusCode: 500, body: JSON.stringify({ error: processedCountError.message }) };
  }

  const processedItems = processedCount ?? 0;
  const done = processedItems >= totalItems;
  const progress = Math.round((processedItems / totalItems) * 100);

  await supabase
    .from("audits")
    .update({ status: done ? "complete" : "running", progress: done ? 100 : progress })
    .eq("id", audit.id);

  return {
    statusCode: 200,
    body: JSON.stringify({
      done,
      totalItems,
      processedItems,
      batchProcessed: batch.length,
      findingsCreatedThisBatch: insertedFindings,
    }),
  };
};
