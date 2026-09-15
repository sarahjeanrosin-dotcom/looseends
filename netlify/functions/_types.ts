// Shared types mirroring the Supabase schema (supabase/migrations/0001_init.sql).
// Kept hand-written and small for now; revisit generating these from the DB
// (supabase gen types typescript) once the schema stabilizes.

export type AuditStatus = "pending" | "running" | "complete" | "failed";

export interface Audit {
  id: string;
  release_name: string;
  description: string | null;
  /** @deprecated superseded by the release_briefs table (Stage 4) */
  brief_file_path: string | null;
  /** @deprecated superseded by the release_briefs table (Stage 4) */
  brief_content_text: string | null;
  created_at: string;
  status: AuditStatus;
  progress: number;
}

/** A row in `release_briefs` — one uploaded product brief / release doc file. */
export interface ReleaseBrief {
  id: string;
  audit_id: string;
  file_path: string;
  file_name: string;
  content_text: string;
  created_at: string;
}

export type SharePointRequestStatus = "pending" | "fulfilled" | "failed";

/** A row in `sharepoint_requests` — a queued plain-language SharePoint search
 * request, fulfilled by a scheduled Claude agent (see README). */
export interface SharePointRequest {
  id: string;
  audit_id: string;
  prompt: string;
  status: SharePointRequestStatus;
  summary: string | null;
  created_at: string;
  fulfilled_at: string | null;
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
  /** Set once the Stage 3 AI pass has evaluated this item (regardless of verdict). */
  processed: boolean;
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
  /** The content_items row this finding was generated from, when known. */
  content_item_id: string | null;
  source: FindingSource;
  url_or_path: string;
  title: string;
  relevant: boolean;
  /** relevant=false but not high-confidence — kept for human review per Stage 3 step 4. */
  borderline: boolean;
  reason: string | null;
  /** The exact outdated text, quoted verbatim, that needs to change — for locating it directly. */
  legacy_copy: string | null;
  suggested_action: string | null;
  lift_score: number | null; // 1-5
  lift_label: string | null;
}
