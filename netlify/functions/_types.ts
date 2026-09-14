// Shared types mirroring the Supabase schema (supabase/migrations/0001_init.sql).
// Kept hand-written and small for now; revisit generating these from the DB
// (supabase gen types typescript) once the schema stabilizes.

export type AuditStatus = "pending" | "running" | "complete" | "failed";

export interface Audit {
  id: string;
  release_name: string;
  description: string | null;
  brief_file_path: string | null;
  created_at: string;
  status: AuditStatus;
  progress: number;
}

export type FindingSource = "website" | "sharepoint";

export interface Finding {
  id: string;
  audit_id: string;
  source: FindingSource;
  url_or_path: string;
  title: string;
  relevant: boolean;
  reason: string | null;
  suggested_action: string | null;
  lift_score: number | null; // 1-5
  lift_label: string | null;
}
