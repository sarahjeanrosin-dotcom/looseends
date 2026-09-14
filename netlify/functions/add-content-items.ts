// POST /.netlify/functions/add-content-items
// Saves a batch of normalized content items ({ source, path, title,
// contentText, extractable }) against an audit. Used by the Stage 1
// SharePoint upload step today; Stage 2's website crawler will call this
// same endpoint with source: "website" once it exists.
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";
import type { NormalizedContentItem } from "./_types";

interface RequestBody {
  audit_id?: string;
  items?: NormalizedContentItem[];
}

function isValidItem(item: unknown): item is NormalizedContentItem {
  if (typeof item !== "object" || item === null) return false;
  const candidate = item as Record<string, unknown>;
  return (
    (candidate.source === "website" || candidate.source === "sharepoint") &&
    typeof candidate.path === "string" &&
    candidate.path.length > 0 &&
    typeof candidate.title === "string" &&
    candidate.title.length > 0 &&
    typeof candidate.contentText === "string"
  );
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
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "items must be a non-empty array" }) };
  }
  const invalidIndex = body.items.findIndex((item) => !isValidItem(item));
  if (invalidIndex !== -1) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: `items[${invalidIndex}] is missing required fields (source, path, title, contentText)`,
      }),
    };
  }

  const { data: audit, error: auditError } = await supabase
    .from("audits")
    .select("id")
    .eq("id", body.audit_id)
    .maybeSingle();
  if (auditError) {
    return { statusCode: 500, body: JSON.stringify({ error: auditError.message }) };
  }
  if (!audit) {
    return { statusCode: 404, body: JSON.stringify({ error: `No audit found with id ${body.audit_id}` }) };
  }

  const rows = body.items.map((item) => ({
    audit_id: body.audit_id,
    source: item.source,
    url_or_path: item.path,
    title: item.title,
    content_text: item.contentText,
    extractable: item.extractable ?? true,
  }));

  const { data, error } = await supabase.from("content_items").insert(rows).select();
  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return { statusCode: 201, body: JSON.stringify({ contentItems: data }) };
};
