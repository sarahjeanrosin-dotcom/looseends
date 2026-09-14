// POST /.netlify/functions/update-audit
// Updates an existing audit's release_name/description — the New Audit
// screen creates the audit as soon as it's first needed (first upload or
// Run Audit click) and lets the user keep editing name/description after.
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";

interface RequestBody {
  audit_id?: string;
  release_name?: string;
  description?: string;
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

  const updates: Record<string, string> = {};
  if (body.release_name !== undefined) updates.release_name = body.release_name;
  if (body.description !== undefined) updates.description = body.description;
  if (Object.keys(updates).length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "Nothing to update" }) };
  }

  const { data, error } = await supabase
    .from("audits")
    .update(updates)
    .eq("id", body.audit_id)
    .select()
    .single();
  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ audit: data }) };
};
