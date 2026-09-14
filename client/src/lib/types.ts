// Mirrors netlify/functions/_types.ts on the server side, plus the extra
// client-only staging state used while building up a batch of SharePoint
// content before it's saved.

export type AuditStatus = "pending" | "running" | "complete" | "failed";

export interface Audit {
  id: string;
  release_name: string;
  description: string | null;
  brief_file_path: string | null;
  brief_content_text: string | null;
  created_at: string;
  status: AuditStatus;
  progress: number;
}

export type LiftCounts = Record<1 | 2 | 3 | 4 | 5, number>;

/** An audit row plus a breakdown of its relevant findings by lift score, as returned by list-audits. */
export interface AuditWithLiftCounts extends Audit {
  liftCounts: LiftCounts;
}

export type FindingSource = "website" | "sharepoint";

export interface Finding {
  id: string;
  audit_id: string;
  content_item_id: string | null;
  source: FindingSource;
  url_or_path: string;
  title: string;
  relevant: boolean;
  borderline: boolean;
  reason: string | null;
  suggested_action: string | null;
  lift_score: number | null;
  lift_label: string | null;
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

export type ContentItemSource = "website" | "sharepoint";

/** A saved row from the `content_items` table, as returned by the API. */
export interface ContentItem {
  id: string;
  audit_id: string;
  source: ContentItemSource;
  url_or_path: string;
  title: string;
  content_text: string;
  extractable: boolean;
  processed: boolean;
  created_at: string;
}

/** The normalized shape both Stage 1 (SharePoint) and Stage 2 (website) produce. */
export interface NormalizedContentItem {
  source: ContentItemSource;
  path: string;
  title: string;
  contentText: string;
  extractable: boolean;
}

export type StagedItemStatus = "extracting" | "ready" | "error";

/** One row in the upload staging area, before it's saved to the audit. */
export interface StagedSharePointItem {
  id: string;
  title: string;
  contentText: string;
  extractable: boolean;
  note?: string;
  sharepointUrl: string;
  sourceFileName?: string;
  status: StagedItemStatus;
}
