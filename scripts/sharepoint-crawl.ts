// Stage 1 extension: pushes SharePoint content Claude has already found and
// read (via the Microsoft 365 MCP connector, in this same live session) into
// an audit — content items or the release brief, deduplicated against
// what's already there.
//
// This does NOT crawl SharePoint itself — there's no portable credential to
// hand a standalone script for that without an Azure AD app registration
// (see README), and the MCP connector only works inside a live Claude
// session. The actual search/read happens in conversation via
// sharepoint_search / sharepoint_folder_search / read_resource; this script
// is the formalized, reusable "push" step that used to be a one-off curl or
// throwaway .mjs file per audit.
//
// Usage:
//   npx tsx scripts/sharepoint-crawl.ts <path-to-items.json>
//
// items.json shape:
// {
//   "auditId": "<uuid>",
//   "items": [
//     { "kind": "content", "title": "...", "url": "https://...", "contentText": "..." },
//     { "kind": "brief",   "title": "...", "url": "https://...", "contentText": "..." }
//   ]
// }
// "content" items go to content_items (source: sharepoint) via add-content-items.
// "brief" items go to release_briefs via finalize-release-brief.
// Items whose url already exists on the audit (in content_items.url_or_path
// or release_briefs.file_path) are skipped, so re-running after adding more
// results is safe.
import { readFileSync } from "fs";

const SITE_URL = process.env.SITE_URL ?? "https://loosends.netlify.app";

interface InputItem {
  kind: "content" | "brief";
  title: string;
  url: string;
  contentText: string;
}
interface InputFile {
  auditId: string;
  items: InputItem[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SITE_URL}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `${path} failed with status ${res.status}`);
  }
  return body as T;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx scripts/sharepoint-crawl.ts <path-to-items.json>");
    process.exit(1);
  }

  const input: InputFile = JSON.parse(readFileSync(filePath, "utf8"));
  if (!input.auditId || !Array.isArray(input.items) || input.items.length === 0) {
    console.error("items.json must have { auditId, items: [...] } with at least one item");
    process.exit(1);
  }

  console.log(`Pushing to audit ${input.auditId} via ${SITE_URL}\n`);

  const existing = await request<{
    contentItems: Array<{ url_or_path: string }>;
    releaseBriefs: Array<{ file_path: string }>;
  }>(`/.netlify/functions/get-audit?id=${encodeURIComponent(input.auditId)}`);
  const existingContentUrls = new Set(existing.contentItems.map((c) => c.url_or_path));
  const existingBriefUrls = new Set(existing.releaseBriefs.map((b) => b.file_path));

  let pushedContent = 0;
  let pushedBriefs = 0;
  let skipped = 0;

  const contentToPush = input.items.filter((i) => i.kind === "content" && !existingContentUrls.has(i.url));
  const briefsToPush = input.items.filter((i) => i.kind === "brief" && !existingBriefUrls.has(i.url));
  skipped = input.items.length - contentToPush.length - briefsToPush.length;

  if (contentToPush.length > 0) {
    const result = await request<{ contentItems: unknown[] }>("/.netlify/functions/add-content-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audit_id: input.auditId,
        items: contentToPush.map((i) => ({
          source: "sharepoint",
          path: i.url,
          title: i.title,
          contentText: i.contentText,
          extractable: true,
        })),
      }),
    });
    pushedContent = result.contentItems.length;
  }

  for (const brief of briefsToPush) {
    await request("/.netlify/functions/finalize-release-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audit_id: input.auditId,
        path: brief.url,
        file_name: brief.title,
        content_text: brief.contentText,
      }),
    });
    pushedBriefs++;
  }

  console.log(`Pushed ${pushedContent} content item(s), ${pushedBriefs} brief(s). Skipped ${skipped} already present.`);
}

main().catch((err) => {
  console.error("sharepoint-crawl failed:", err);
  process.exit(1);
});
