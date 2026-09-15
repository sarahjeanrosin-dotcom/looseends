// GET /.netlify/functions/get-audit?id=<audit_id>
// Gets one audit plus its findings, content items, release briefs, and
// pending/past SharePoint requests. Backs the Audit Results screen (Stage 4)
// and the drill-in from Past Audits (Stage 6). CSV formatting is a separate
// endpoint (Stage 5).
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";
import { json } from "./_http";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const id = event.queryStringParameters?.id;
  if (!id) {
    return json(400, { error: "id query param is required" });
  }

  const [
    { data: audit, error: auditError },
    { data: findings, error: findingsError },
    { data: contentItems, error: contentItemsError },
    { data: releaseBriefs, error: releaseBriefsError },
    { data: sharepointRequests, error: sharepointRequestsError },
  ] = await Promise.all([
    supabase.from("audits").select("*").eq("id", id).single(),
    supabase.from("findings").select("*").eq("audit_id", id),
    supabase.from("content_items").select("*").eq("audit_id", id),
    supabase.from("release_briefs").select("*").eq("audit_id", id),
    supabase.from("sharepoint_requests").select("*").eq("audit_id", id).order("created_at", { ascending: false }),
  ]);

  if (auditError) {
    return json(404, { error: auditError.message });
  }
  if (findingsError) {
    return json(500, { error: findingsError.message });
  }
  if (contentItemsError) {
    return json(500, { error: contentItemsError.message });
  }
  if (releaseBriefsError) {
    return json(500, { error: releaseBriefsError.message });
  }
  if (sharepointRequestsError) {
    return json(500, { error: sharepointRequestsError.message });
  }

  return json(200, { audit, findings, contentItems, releaseBriefs, sharepointRequests });
};
