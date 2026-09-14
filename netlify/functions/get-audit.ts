// GET /.netlify/functions/get-audit?id=<audit_id>
// Gets one audit plus its findings. Stage 0: stub — straightforward fetch,
// no CSV/formatting logic (that's Stage 5). Backs the Audit Results screen
// (Stage 4) and the drill-in from Past Audits (Stage 6).
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

  const [{ data: audit, error: auditError }, { data: findings, error: findingsError }] =
    await Promise.all([
      supabase.from("audits").select("*").eq("id", id).single(),
      supabase.from("findings").select("*").eq("audit_id", id),
    ]);

  if (auditError) {
    return { statusCode: 404, body: JSON.stringify({ error: auditError.message }) };
  }
  if (findingsError) {
    return { statusCode: 500, body: JSON.stringify({ error: findingsError.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ audit, findings }) };
};
