// GET /.netlify/functions/export-audit-csv?id=<audit_id>
// Exports an audit's findings (relevant + borderline — everything stored in
// `findings`, same set the Results screen shows) as a CSV download. The
// frontend's "Download CSV" link is a plain <a href>, so returning
// Content-Disposition: attachment is what actually triggers the browser
// download — no client-side blob/JS needed.
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";
import { json } from "./_http";
import type { Audit, Finding } from "./_types";

// Extends the spec's original 8 columns with "Legacy Copy" — the exact
// outdated text to find and replace, so this CSV is a directly actionable
// handoff to whoever owns the page/file, not just a list of things to review.
const COLUMNS = [
  "Release Name",
  "Source",
  "Title",
  "URL or Path",
  "Legacy Copy",
  "Reason",
  "Suggested Action",
  "Lift Score",
  "Lift Label",
] as const;

function escapeCsvField(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(fields: Array<string | number | null | undefined>): string {
  return fields.map(escapeCsvField).join(",") + "\r\n";
}

function buildCsv(audit: Pick<Audit, "release_name">, findings: Finding[]): string {
  let csv = toCsvRow([...COLUMNS]);
  for (const f of findings) {
    csv += toCsvRow([
      audit.release_name,
      f.source,
      f.title,
      f.url_or_path,
      f.legacy_copy,
      f.reason,
      f.suggested_action,
      f.lift_score,
      f.lift_label,
    ]);
  }
  return csv;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const id = event.queryStringParameters?.id;
  if (!id) {
    return json(400, { error: "id query param is required" });
  }

  const [{ data: audit, error: auditError }, { data: findings, error: findingsError }] = await Promise.all([
    supabase.from("audits").select("release_name").eq("id", id).single<Pick<Audit, "release_name">>(),
    supabase.from("findings").select("*").eq("audit_id", id).returns<Finding[]>(),
  ]);
  if (auditError) {
    return json(404, { error: auditError.message });
  }
  if (findingsError) {
    return json(500, { error: findingsError.message });
  }

  const csv = buildCsv(audit, findings ?? []);
  const safeFileName = audit.release_name.replace(/[^a-zA-Z0-9._-]/g, "_") || "audit";

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFileName}-findings.csv"`,
    },
    body: csv,
  };
};
