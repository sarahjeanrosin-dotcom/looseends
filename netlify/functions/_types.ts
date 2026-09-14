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

export type ContentItemSource = "website" | "sharepoint";

/** A row in `content_items` — the normalized pre-AI-pass content that feeds Stage 3. */
export interface ContentItem {
  id: string;
  audit_id: string;
  source: ContentItemSource;
  url_or_path: string;
  title: string;
  content_text: string;
  extractable: boolean;
  created_at: string;
}

/** The shape { source, path, title, contentText, extractable } produced by
 * the upload step (Stage 1) and the crawler (Stage 2), before it's inserted
 * into `content_items`. */
export interface NormalizedContentItem {
  source: ContentItemSource;
  path: string;
  title: string;
  contentText: string;
  extractable?: boolean;
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
