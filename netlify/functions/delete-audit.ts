// POST /.netlify/functions/delete-audit
// Deletes an audit. Every related table (findings, content_items,
// release_briefs, sharepoint_requests) references audits.id with
// ON DELETE CASCADE, so this one delete cleans up everything for it —
// no separate cleanup calls needed.
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";
import { json } from "./_http";

interface RequestBody {
  audit_id?: string;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body: RequestBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  if (!body.audit_id) {
    return json(400, { error: "audit_id is required" });
  }

  const { error } = await supabase.from("audits").delete().eq("id", body.audit_id);
  if (error) {
    return json(500, { error: error.message });
  }

  return json(200, { deleted: true });
};
