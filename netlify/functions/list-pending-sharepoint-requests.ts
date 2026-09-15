// GET /.netlify/functions/list-pending-sharepoint-requests
// Polled by the scheduled Claude agent (see README) — returns every pending
// SharePoint request across all audits, with enough release context
// (name/description) that the agent doesn't need a round trip per request.
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";
import { json } from "./_http";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { data, error } = await supabase
    .from("sharepoint_requests")
    .select("*, audits(release_name, description)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    return json(500, { error: error.message });
  }

  return json(200, { requests: data ?? [] });
};
