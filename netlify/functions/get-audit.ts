// GET /.netlify/functions/get-audit?id=<audit_id>
// Gets one audit plus its findings, content items, and release briefs.
// Backs the Audit Results screen (Stage 4) and the drill-in from Past
// Audits (Stage 6). CSV formatting is a separate endpoint (Stage 5).
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const id = event.queryStringParameters?.id;
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: "id query param is required" }) };
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
    return { statusCode: 404, body: JSON.stringify({ error: auditError.message }) };
  }
  if (findingsError) {
    return { statusCode: 500, body: JSON.stringify({ error: findingsError.message }) };
  }
  if (contentItemsError) {
    return { statusCode: 500, body: JSON.stringify({ error: contentItemsError.message }) };
  }
  if (releaseBriefsError) {
    return { statusCode: 500, body: JSON.stringify({ error: releaseBriefsError.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ audit, findings, contentItems, releaseBriefs }) };
};
