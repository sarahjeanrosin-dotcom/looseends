// Website crawler (Stage 2). Starts from a sitemap.xml URL, fetches each
// page, strips boilerplate, and extracts { source: 'website', url, title,
// lastModified, contentText } — the same normalized shape the SharePoint
// upload step (Stage 1) produces. Shared by the CLI test script
// (scripts/crawl-test.ts) and the crawl-website Netlify Function.
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { XMLParser } from "fast-xml-parser";

export interface CrawledPage {
  source: "website";
  url: string;
  title: string;
  lastModified?: string;
  contentText: string;
}

export interface CrawlFailure {
  url: string;
  reason: string;
}

export interface CrawlSummary {
  sitemapUrl: string;
  discoveredUrlCount: number;
  crawledCount: number;
  skippedCount: number;
  failures: CrawlFailure[];
  pages: CrawledPage[];
}

export interface CrawlOptions {
  /** Stop after crawling this many pages. Default 20 — keep this modest for
   * test runs; the CLI script can override it for a fuller crawl. */
  maxPages?: number;
  /** Delay between successive page fetches, in ms. Default 300. */
  crawlDelayMs?: number;
  /** Per-request fetch timeout, in ms. Default 10000. */
  fetchTimeoutMs?: number;
  userAgent?: string;
}

const DEFAULT_OPTIONS: Required<CrawlOptions> = {
  maxPages: 20,
  crawlDelayMs: 300,
  fetchTimeoutMs: 10_000,
  userAgent: "ReleaseImpactFinder/1.0 (+https://getgenea.com)",
};

// Extensions that are never worth fetching as an HTML page — filtered out
// before we make a request at all, so they show up as "skipped" not "failed".
const NON_HTML_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
  "jpg", "jpeg", "png", "gif", "svg", "webp", "avif", "ico", "bmp",
  "zip", "rar", "7z", "gz", "tar",
  "mp3", "mp4", "mov", "avi", "webm", "wav",
  "css", "js", "json", "xml", "csv", "txt",
  "woff", "woff2", "ttf", "eot",
]);

function extensionOf(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function isLikelyNonHtml(url: string): boolean {
  const ext = extensionOf(url);
  return ext !== null && NON_HTML_EXTENSIONS.has(ext);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, timeoutMs: number, userAgent: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": userAgent, Accept: "text/html,application/xhtml+xml,application/xml" },
    });
  } finally {
    clearTimeout(timer);
  }
}

interface SitemapUrlEntry {
  url: string;
  lastModified?: string;
}

const xmlParser = new XMLParser({ ignoreAttributes: true, trimValues: true });

/**
 * Reads a sitemap.xml (or a sitemap index that points at other sitemaps, one
 * level deep) and returns the page URLs it lists. Stops early once it has
 * gathered enough URLs for `maxUrls` — we don't need to fully enumerate a
 * huge sitemap when the crawl itself is capped.
 */
async function fetchSitemapEntries(
  sitemapUrl: string,
  maxUrls: number,
  options: Required<CrawlOptions>,
  depth = 0
): Promise<SitemapUrlEntry[]> {
  if (depth > 1) return []; // one level of sitemap-index nesting is enough

  const res = await fetchWithTimeout(sitemapUrl, options.fetchTimeoutMs, options.userAgent);
  if (!res.ok) {
    throw new Error(`Failed to fetch sitemap ${sitemapUrl}: HTTP ${res.status}`);
  }
  const xml = await res.text();
  const parsed = xmlParser.parse(xml);

  // Sitemap index: <sitemapindex><sitemap><loc>...</loc></sitemap>...</sitemapindex>
  if (parsed.sitemapindex?.sitemap) {
    const nested = Array.isArray(parsed.sitemapindex.sitemap)
      ? parsed.sitemapindex.sitemap
      : [parsed.sitemapindex.sitemap];

    const entries: SitemapUrlEntry[] = [];
    for (const entry of nested) {
      if (entries.length >= maxUrls) break;
      const nestedUrl: string | undefined = entry?.loc;
      if (!nestedUrl) continue;
      try {
        const nestedEntries = await fetchSitemapEntries(nestedUrl, maxUrls - entries.length, options, depth + 1);
        entries.push(...nestedEntries);
      } catch {
        // A broken nested sitemap shouldn't take down the whole crawl —
        // it'll simply contribute zero URLs.
      }
    }
    return entries;
  }

  // Regular sitemap: <urlset><url><loc>...</loc><lastmod>...</lastmod></url>...</urlset>
  if (parsed.urlset?.url) {
    const urls = Array.isArray(parsed.urlset.url) ? parsed.urlset.url : [parsed.urlset.url];
    return urls
      .filter((entry: { loc?: string }) => !!entry?.loc)
      .map((entry: { loc: string; lastmod?: string }) => ({
        url: entry.loc,
        lastModified: entry.lastmod,
      }));
  }

  return [];
}

const BOILERPLATE_SELECTORS = [
  "script", "style", "noscript", "template",
  "nav", "header", "footer", "form", "iframe", "svg",
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  ".nav", ".navbar", ".menu", ".footer", ".header",
  ".cookie", ".cookie-banner", ".cookie-consent", ".skip-link",
];

function collapseWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * Falls back to a plain "strip obvious boilerplate tags, take what's left"
 * extraction for pages Readability can't confidently parse as an article
 * (e.g. thin pages like a contact or pricing page).
 */
function fallbackExtract(document: Document): string {
  document.querySelectorAll(BOILERPLATE_SELECTORS.join(", ")).forEach((el) => el.remove());
  return collapseWhitespace(document.body?.textContent ?? "");
}

/**
 * Extracts title + main content text from a page's raw HTML.
 *
 * We tried a hand-rolled "prefer <main>, else <article>, else .content"
 * selector strategy first, but real sites (this one included — a WordPress/
 * Avia theme) reuse landmark tags like <main> for unrelated UI chrome (a
 * sticky CTA banner, a mega-menu panel), so tag/class guessing picked the
 * wrong element. Readability's content-density algorithm (the same one
 * behind Firefox Reader View) scores blocks by actual text/paragraph
 * density instead of trusting tag semantics, which is robust to that.
 */
function extractPageContent(html: string, url: string): { title: string; contentText: string } {
  const dom = new JSDOM(html, { url });
  const fallbackTitle =
    dom.window.document.title.trim() ||
    dom.window.document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() ||
    dom.window.document.querySelector("h1")?.textContent?.trim() ||
    url;

  let article: ReturnType<Readability["parse"]> = null;
  try {
    article = new Readability(dom.window.document).parse();
  } catch {
    // Readability throws on some malformed documents — fall through to the
    // plain-text fallback below rather than failing the whole page.
  }

  const readabilityText = article?.textContent ? collapseWhitespace(article.textContent) : "";
  if (readabilityText.length > 0) {
    return { title: article?.title?.trim() || fallbackTitle, contentText: readabilityText };
  }

  // Readability found nothing (thin page, or a layout it couldn't parse).
  // Re-parse fresh since the previous JSDOM's document was mutated by the
  // Readability parse attempt above.
  const fallbackDom = new JSDOM(html, { url });
  return { title: fallbackTitle, contentText: fallbackExtract(fallbackDom.window.document) };
}

export async function crawlSite(sitemapUrl: string, options: CrawlOptions = {}): Promise<CrawlSummary> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const failures: CrawlFailure[] = [];
  let entries: SitemapUrlEntry[];
  try {
    // Gather a bit more than maxPages so that skipped non-HTML URLs don't
    // eat into the page budget.
    entries = await fetchSitemapEntries(sitemapUrl, opts.maxPages * 3, opts);
  } catch (err) {
    return {
      sitemapUrl,
      discoveredUrlCount: 0,
      crawledCount: 0,
      skippedCount: 0,
      failures: [{ url: sitemapUrl, reason: err instanceof Error ? err.message : String(err) }],
      pages: [],
    };
  }

  const discoveredUrlCount = entries.length;
  let skippedCount = 0;
  const pages: CrawledPage[] = [];

  for (const entry of entries) {
    if (pages.length >= opts.maxPages) break;

    if (isLikelyNonHtml(entry.url)) {
      skippedCount++;
      continue;
    }

    if (pages.length > 0) {
      await sleep(opts.crawlDelayMs);
    }

    try {
      const res = await fetchWithTimeout(entry.url, opts.fetchTimeoutMs, opts.userAgent);
      const contentType = res.headers.get("content-type") ?? "";

      if (!res.ok) {
        failures.push({ url: entry.url, reason: `HTTP ${res.status}` });
        continue;
      }
      if (!contentType.includes("text/html")) {
        skippedCount++;
        continue;
      }

      const html = await res.text();
      const { title, contentText } = extractPageContent(html, entry.url);
      const lastModified = entry.lastModified ?? res.headers.get("last-modified") ?? undefined;

      pages.push({ source: "website", url: entry.url, title, lastModified, contentText });
    } catch (err) {
      failures.push({ url: entry.url, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    sitemapUrl,
    discoveredUrlCount,
    crawledCount: pages.length,
    skippedCount,
    failures,
    pages,
  };
}
