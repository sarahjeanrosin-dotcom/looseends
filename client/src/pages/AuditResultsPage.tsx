import { useEffect, useRef, useState } from "react";
import { crawlWebsite, getAudit, runAuditPassChunk } from "../lib/api";
import type { Audit, ContentItem, Finding, SharePointRequest } from "../lib/types";
import { FindingsTable } from "../components/FindingsTable";
import { SharePointRequestBox } from "../components/SharePointRequestBox";

const POLL_INTERVAL_MS = 1500;

interface AuditResultsPageProps {
  auditId: string;
  onBack: () => void;
}

export function AuditResultsPage({ auditId, onBack }: AuditResultsPageProps) {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [sharepointRequests, setSharepointRequests] = useState<SharePointRequest[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const hasStartedDriving = useRef(false);

  async function refresh() {
    try {
      const data = await getAudit(auditId);
      setAudit(data.audit);
      setFindings(data.findings);
      setSharepointRequests(data.sharepointRequests);
      return data;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  // Drives the actual work: crawl (only if no website content exists yet —
  // safe to call again after a reload, per Stage 4's design) then the
  // chunked AI matching loop until done. The separate polling effect below
  // keeps the displayed status/progress in sync from Supabase independently
  // of this loop, so a reload mid-run picks the audit back up correctly.
  async function driveAudit(contentItems: ContentItem[]) {
    setDriveError(null);
    try {
      const hasWebsiteContent = contentItems.some((item) => item.source === "website");
      if (!hasWebsiteContent) {
        try {
          await crawlWebsite(auditId);
        } catch (err) {
          // Don't block matching on a crawl failure — SharePoint-only
          // content can still be evaluated.
          setDriveError(`Website crawl failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      let done = false;
      while (!done) {
        const result = await runAuditPassChunk(auditId);
        done = result.done;
      }
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : String(err));
    } finally {
      refresh();
    }
  }

  useEffect(() => {
    hasStartedDriving.current = false;
    let cancelled = false;

    async function init() {
      const data = await getAudit(auditId).catch((err) => {
        setLoadError(err instanceof Error ? err.message : String(err));
        return null;
      });
      if (!data || cancelled) return;
      setAudit(data.audit);
      setFindings(data.findings);
      setSharepointRequests(data.sharepointRequests);
      if (data.audit.status !== "complete" && !hasStartedDriving.current) {
        hasStartedDriving.current = true;
        driveAudit(data.contentItems);
      }
    }
    init();

    const interval = setInterval(async () => {
      const data = await getAudit(auditId).catch(() => null);
      if (!data || cancelled) return;
      setAudit(data.audit);
      setFindings(data.findings);
      setSharepointRequests(data.sharepointRequests);
      if (data.audit.status === "complete") {
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId]);

  return (
    <div className="page">
      <button type="button" className="page__back" onClick={onBack}>
        ← Past Audits
      </button>

      {loadError && <p className="app__error">{loadError}</p>}

      {audit && (
        <>
          <h1>{audit.release_name}</h1>
          {audit.description && <p className="app__subtitle">{audit.description}</p>}

          <section className="app__section">
            <h2>SharePoint content</h2>
            <p className="app__subtitle">
              Describe what to look for in the Marketing site. A scheduled Claude agent checks for
              requests periodically and adds what's relevant.
            </p>
            <SharePointRequestBox
              getAuditId={async () => auditId}
              requests={sharepointRequests}
              onCreated={(r) => setSharepointRequests((prev) => [r, ...prev])}
            />
          </section>

          {audit.status !== "complete" ? (
            <section className="app__section">
              <p className="app__subtitle">
                Status: {audit.status} — {audit.progress}%
              </p>
              <progress value={audit.progress} max={100} style={{ width: "100%" }} />
              {driveError && <p className="app__error">{driveError}</p>}
            </section>
          ) : (
            <FindingsTable auditId={auditId} findings={findings} />
          )}
        </>
      )}
    </div>
  );
}
