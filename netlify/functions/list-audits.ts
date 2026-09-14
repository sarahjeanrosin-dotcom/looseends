// GET /.netlify/functions/list-audits
// Lists historic audits, most recent first, each with a breakdown of its
// relevant findings by lift score (1-5) — backs the Past Audits screen
// (Stage 6). Item counts are computed in-memory from a single findings
// query rather than a per-audit round trip; fine at this app's scale
// (single user, a modest number of audits/findings).
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";
import type { Audit, Finding } from "./_types";

export type LiftCounts = Record<1 | 2 | 3 | 4 | 5, number>;

export interface AuditWithLiftCounts extends Audit {
  liftCounts: LiftCounts;
}

function emptyLiftCounts(): LiftCounts {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const [{ data: audits, error: auditsError }, { data: findings, error: findingsError }] = await Promise.all([
    supabase.from("audits").select("*").order("created_at", { ascending: false }).returns<Audit[]>(),
    supabase
      .from("findings")
      .select("audit_id, lift_score")
      .eq("relevant", true)
      .returns<Pick<Finding, "audit_id" | "lift_score">[]>(),
  ]);

  if (auditsError) {
    return { statusCode: 500, body: JSON.stringify({ error: auditsError.message }) };
  }
  if (findingsError) {
    return { statusCode: 500, body: JSON.stringify({ error: findingsError.message }) };
  }

  const liftCountsByAudit = new Map<string, LiftCounts>();
  for (const f of findings ?? []) {
    if (!f.lift_score) continue;
    if (!liftCountsByAudit.has(f.audit_id)) {
      liftCountsByAudit.set(f.audit_id, emptyLiftCounts());
    }
    const counts = liftCountsByAudit.get(f.audit_id)!;
    counts[f.lift_score as 1 | 2 | 3 | 4 | 5] = (counts[f.lift_score as 1 | 2 | 3 | 4 | 5] ?? 0) + 1;
  }

  const auditsWithCounts: AuditWithLiftCounts[] = (audits ?? []).map((audit) => ({
    ...audit,
    liftCounts: liftCountsByAudit.get(audit.id) ?? emptyLiftCounts(),
  }));

  return { statusCode: 200, body: JSON.stringify({ audits: auditsWithCounts }) };
};
