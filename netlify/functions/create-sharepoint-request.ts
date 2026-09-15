// POST /.netlify/functions/create-sharepoint-request
// Queues a plain-language SharePoint search request from the app (New Audit
// / Results screen) — the deployed app can't search SharePoint itself (see
// README), so this just records what's wanted. A scheduled Claude agent
// with the Microsoft 365 connector polls list-pending-sharepoint-requests,
// does the actual search, and calls fulfill-sharepoint-request when done.
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";
import { json } from "./_http";

interface RequestBody {
  audit_id?: string;
  prompt?: string;
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
  if (!body.prompt?.trim()) {
    return json(400, { error: "prompt is required" });
  }

  const { data: audit, error: auditError } = await supabase
    .from("audits")
    .select("id")
    .eq("id", body.audit_id)
    .maybeSingle();
  if (auditError) {
    return json(500, { error: auditError.message });
  }
  if (!audit) {
    return json(404, { error: `No audit found with id ${body.audit_id}` });
  }

  const { data, error } = await supabase
    .from("sharepoint_requests")
    .insert({ audit_id: body.audit_id, prompt: body.prompt.trim(), status: "pending" })
    .select()
    .single();
  if (error) {
    return json(500, { error: error.message });
  }

  return json(201, { sharepointRequest: data });
};
