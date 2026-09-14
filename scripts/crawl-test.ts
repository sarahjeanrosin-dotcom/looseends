// Stage 2 CLI test script: run the crawler standalone, against a real
// sitemap, before it's wired into the deployed app.
//
// Usage:
//   npx tsx scripts/crawl-test.ts <sitemapUrl> [--max=20] [--delay=300]
//
// Example:
//   npx tsx scripts/crawl-test.ts https://www.getgenea.com/sitemap.xml --max=15
import { crawlSite } from "../netlify/functions/_crawler";

function parseArgs(argv: string[]) {
  const [sitemapUrl, ...rest] = argv;
  const flags: Record<string, string> = {};
  for (const arg of rest) {
    const match = arg.match(/^--([a-zA-Z]+)=(.+)$/);
    if (match) flags[match[1]] = match[2];
  }
  return { sitemapUrl, flags };
}

async function main() {
  const { sitemapUrl, flags } = parseArgs(process.argv.slice(2));

  if (!sitemapUrl) {
    console.error("Usage: npx tsx scripts/crawl-test.ts <sitemapUrl> [--max=20] [--delay=300]");
    process.exit(1);
  }

  const maxPages = flags.max ? Number(flags.max) : 20;
  const crawlDelayMs = flags.delay ? Number(flags.delay) : 300;

  console.log(`Crawling from sitemap: ${sitemapUrl}`);
  console.log(`  maxPages=${maxPages} crawlDelayMs=${crawlDelayMs}\n`);

  const started = Date.now();
  const summary = await crawlSite(sitemapUrl, { maxPages, crawlDelayMs });
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);

  console.log("--- Summary ---");
  console.log(`URLs discovered in sitemap: ${summary.discoveredUrlCount}`);
  console.log(`Pages crawled successfully: ${summary.crawledCount}`);
  console.log(`Skipped (non-HTML):         ${summary.skippedCount}`);
  console.log(`Failed fetches:              ${summary.failures.length}`);
  console.log(`Elapsed:                      ${elapsedSec}s\n`);

  if (summary.failures.length > 0) {
    console.log("--- Failures ---");
    for (const failure of summary.failures) {
      console.log(`  ${failure.url} — ${failure.reason}`);
    }
    console.log();
  }

  console.log("--- Pages ---");
  for (const page of summary.pages) {
    const preview = page.contentText.slice(0, 100).replace(/\s+/g, " ");
    console.log(
      `  [${page.contentText.length.toString().padStart(6)} chars] ${page.title}\n` +
        `    ${page.url}${page.lastModified ? ` (lastmod: ${page.lastModified})` : ""}\n` +
        `    "${preview}${page.contentText.length > 100 ? "…" : ""}"\n`
    );
  }

  if (summary.crawledCount === 0) {
    console.error("No pages were successfully crawled — check the sitemap URL and failures above.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Crawl test script failed:", err);
  process.exit(1);
});
