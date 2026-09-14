// Thin fetch wrappers around the Netlify Functions API. Kept together here
// so Stage 4's real screens can reuse them instead of the ad-hoc calls in
// App.tsx's current Stage 1 test harness.
import type { Audit, ContentItem, Finding } from "./types";

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `Request to ${input} failed with status ${res.status}`);
  }
  return body as T;
}

export function listAudits(): Promise<{ audits: Audit[] }> {
  return request("/.netlify/functions/list-audits");
}

export function createAudit(releaseName: string, description?: string): Promise<{ audit: Audit }> {
  return request("/.netlify/functions/create-audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ release_name: releaseName, description }),
  });
}

export function getAudit(
  id: string
): Promise<{ audit: Audit; findings: Finding[]; contentItems: ContentItem[] }> {
  return request(`/.netlify/functions/get-audit?id=${encodeURIComponent(id)}`);
}

export function createBriefUploadUrl(
  auditId: string,
  fileName: string
): Promise<{ path: string; signedUrl: string; token: string }> {
  return request("/.netlify/functions/create-brief-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audit_id: auditId, file_name: fileName }),
  });
}

export function finalizeReleaseBrief(
  auditId: string,
  path: string,
  contentText: string
): Promise<{ audit: Audit }> {
  return request("/.netlify/functions/finalize-release-brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audit_id: auditId, path, content_text: contentText }),
  });
}

export interface RunAuditPassResult {
  done: boolean;
  totalItems: number;
  processedItems: number;
  batchProcessed: number;
  findingsCreatedThisBatch: Finding[];
}

export function runAuditPassChunk(auditId: string): Promise<RunAuditPassResult> {
  return request("/.netlify/functions/run-audit-pass", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audit_id: auditId }),
  });
}
