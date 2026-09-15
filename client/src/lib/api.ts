// Thin fetch wrappers around the Netlify Functions API, shared by the New
// Audit and Audit Results screens.
import type { Audit, AuditWithLiftCounts, ContentItem, Finding, ReleaseBrief, SharePointRequest } from "./types";

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const isJson = res.headers.get("content-type")?.includes("application/json");
  if (!isJson) {
    // Most commonly hit locally: `vite` alone (no `netlify dev`) has no
    // functions to serve, and falls back to index.html (200, text/html) for
    // any unmatched path — silently parsing that as `{}` would let callers
    // destructure `undefined` out of it instead of getting a clear error.
    throw new Error(
      `Request to ${input} did not return JSON (HTTP ${res.status}) — is the Netlify Functions backend running?`
    );
  }
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? `Request to ${input} failed with status ${res.status}`);
  }
  return body as T;
}

export function listAudits(): Promise<{ audits: AuditWithLiftCounts[] }> {
  return request("/.netlify/functions/list-audits");
}

export function deleteAudit(auditId: string): Promise<{ deleted: boolean }> {
  return request("/.netlify/functions/delete-audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audit_id: auditId }),
  });
}

export function createAudit(releaseName: string, description?: string): Promise<{ audit: Audit }> {
  return request("/.netlify/functions/create-audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ release_name: releaseName, description }),
  });
}

export function updateAudit(
  auditId: string,
  updates: { release_name?: string; description?: string }
): Promise<{ audit: Audit }> {
  return request("/.netlify/functions/update-audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audit_id: auditId, ...updates }),
  });
}

export function getAudit(id: string): Promise<{
  audit: Audit;
  findings: Finding[];
  contentItems: ContentItem[];
  releaseBriefs: ReleaseBrief[];
  sharepointRequests: SharePointRequest[];
}> {
  return request(`/.netlify/functions/get-audit?id=${encodeURIComponent(id)}`);
}

export function createSharepointRequest(
  auditId: string,
  prompt: string
): Promise<{ sharepointRequest: SharePointRequest }> {
  return request("/.netlify/functions/create-sharepoint-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audit_id: auditId, prompt }),
  });
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
  fileName: string,
  contentText: string
): Promise<{ releaseBrief: ReleaseBrief }> {
  return request("/.netlify/functions/finalize-release-brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audit_id: auditId, path, file_name: fileName, content_text: contentText }),
  });
}

export interface CrawlSummary {
  sitemapUrl: string;
  discoveredUrlCount: number;
  crawledCount: number;
  skippedCount: number;
  failures: Array<{ url: string; reason: string }>;
}

export function crawlWebsite(auditId: string): Promise<{ contentItems: ContentItem[]; crawlSummary: CrawlSummary }> {
  return request("/.netlify/functions/crawl-website", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audit_id: auditId }),
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
