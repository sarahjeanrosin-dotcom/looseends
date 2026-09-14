// POST /.netlify/functions/crawl-website
// Wires the Stage 2 crawler into the deployed app: crawls from a sitemap and
// saves the resulting pages as content_items (source: "website"), same as
// the Stage 1 SharePoint upload does via add-content-items.
//
// Kept to a conservative default page count/delay so a single request stays
// safely inside Netlify's synchronous function time limit. For a fuller
// crawl during development, use `npm run crawl:test` (scripts/crawl-test.ts)
// instead — it runs standalone with no timeout. A production-scale crawl
// (hundreds of pages) will need the same chunked/background approach Stage 3
// uses for the AI pass; this function doesn't attempt that yet.
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";
import { json } from "./_http";
import { crawlSite } from "./_crawler";

const DEFAULT_SITEMAP_URL = process.env.WEBSITE_SITEMAP_URL ?? "https://www.getgenea.com/sitemap.xml";
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_CRAWL_DELAY_MS = 200;

interface RequestBody {
  audit_id?: string;
  sitemap_url?: string;
  max_pages?: number;
  crawl_delay_ms?: number;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body: RequestBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (!body.audit_id) {
    return json(400, { error: "audit_id is required" });
  }

  const { data: audit, error: auditError } = await supabase
    .from("audits")
    .select("id")
    .eq("id", body.audit_id)
    .maybeSingle();
  if (auditError) {
    return json(500, { error: auditError.message });
  }
  if (!audit) {
    return json(404, { error: `No audit found with id ${body.audit_id}` });
  }

  const sitemapUrl = body.sitemap_url ?? DEFAULT_SITEMAP_URL;
  const maxPages = body.max_pages ?? DEFAULT_MAX_PAGES;
  const crawlDelayMs = body.crawl_delay_ms ?? DEFAULT_CRAWL_DELAY_MS;

  const summary = await crawlSite(sitemapUrl, { maxPages, crawlDelayMs });

  if (summary.pages.length === 0) {
    return json(200, {
      contentItems: [],
      crawlSummary: {
        sitemapUrl: summary.sitemapUrl,
        discoveredUrlCount: summary.discoveredUrlCount,
        crawledCount: summary.crawledCount,
        skippedCount: summary.skippedCount,
        failures: summary.failures,
      },
    });
  }

  const rows = summary.pages.map((page) => ({
    audit_id: body.audit_id,
    source: "website" as const,
    url_or_path: page.url,
    title: page.title,
    content_text: page.contentText,
    extractable: page.contentText.trim().length > 0,
  }));

  const { data, error } = await supabase.from("content_items").insert(rows).select();
  if (error) {
    return json(500, { error: error.message });
  }

  return json(201, {
    contentItems: data,
    crawlSummary: {
      sitemapUrl: summary.sitemapUrl,
      discoveredUrlCount: summary.discoveredUrlCount,
      crawledCount: summary.crawledCount,
      skippedCount: summary.skippedCount,
      failures: summary.failures,
    },
  });
};
