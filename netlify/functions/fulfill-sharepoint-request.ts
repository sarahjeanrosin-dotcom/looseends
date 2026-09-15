// POST /.netlify/functions/fulfill-sharepoint-request
// Called by the scheduled Claude agent (see README) once it's finished
// acting on a pending SharePoint request — marks it fulfilled or failed
// with a short human-readable summary of what happened.
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";
import { json } from "./_http";

interface RequestBody {
  request_id?: string;
  status?: "fulfilled" | "failed";
  summary?: string;
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
  if (!body.request_id) {
    return json(400, { error: "request_id is required" });
  }
  if (body.status !== "fulfilled" && body.status !== "failed") {
    return json(400, { error: 'status must be "fulfilled" or "failed"' });
  }

  const { data, error } = await supabase
    .from("sharepoint_requests")
    .update({ status: body.status, summary: body.summary ?? null, fulfilled_at: new Date().toISOString() })
    .eq("id", body.request_id)
    .select()
    .single();
  if (error) {
    return json(500, { error: error.message });
  }

  return json(200, { sharepointRequest: data });
};
