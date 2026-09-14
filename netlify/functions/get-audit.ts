// GET /.netlify/functions/get-audit?id=<audit_id>
// Gets one audit plus its findings, content items, and release briefs.
// Backs the Audit Results screen (Stage 4) and the drill-in from Past
// Audits (Stage 6). CSV formatting is a separate endpoint (Stage 5).
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
  ] = await Promise.all([
    supabase.from("audits").select("*").eq("id", id).single(),
    supabase.from("findings").select("*").eq("audit_id", id),
    supabase.from("content_items").select("*").eq("audit_id", id),
    supabase.from("release_briefs").select("*").eq("audit_id", id),
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

  return json(200, { audit, findings, contentItems, releaseBriefs });
};
