import { useEffect, useState } from "react";
import { SharePointUpload } from "../components/SharePointUpload";
import { ReleaseBriefUpload } from "../components/ReleaseBriefUpload";
import { SharePointRequestBox } from "../components/SharePointRequestBox";
import { createAudit, getAudit, updateAudit } from "../lib/api";
import type { ContentItem, ReleaseBrief, SharePointRequest } from "../lib/types";

interface NewAuditPageProps {
  /** Called once the audit exists and Run Audit is clicked — navigates to the Results screen. */
  onAuditReady: (auditId: string) => void;
}

// Persists which audit is currently being drafted so leaving "New Audit"
// (e.g. via the top nav) and coming back resumes it instead of silently
// starting a new, separate audit — the gap that produced 8 duplicate
// "pending" audits in one sitting before this existed.
const DRAFT_KEY = "rif_draft_audit_id";

export function NewAuditPage({ onAuditReady }: NewAuditPageProps) {
  const [releaseName, setReleaseName] = useState("");
  const [description, setDescription] = useState("");
  const [auditId, setAuditId] = useState<string | null>(null);
  const [releaseBriefs, setReleaseBriefs] = useState<ReleaseBrief[]>([]);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [sharepointRequests, setSharepointRequests] = useState<SharePointRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [resumedDraftName, setResumedDraftName] = useState<string | null>(null);

  // On mount, resume whatever draft audit was last being worked on (if any,
  // and if it's still unrun) instead of always starting blank.
  useEffect(() => {
    const draftId = localStorage.getItem(DRAFT_KEY);
    if (!draftId) return;
    getAudit(draftId)
      .then((data) => {
        if (data.audit.status !== "pending") {
          // Already run (or running) elsewhere — not a draft anymore, don't resume it.
          localStorage.removeItem(DRAFT_KEY);
          return;
        }
        setAuditId(data.audit.id);
        setReleaseName(data.audit.release_name);
        setDescription(data.audit.description ?? "");
        setReleaseBriefs(data.releaseBriefs);
        setContentItems(data.contentItems);
        setSharepointRequests(data.sharepointRequests);
        setResumedDraftName(data.audit.release_name);
      })
      .catch(() => {
        // Draft audit no longer exists or failed to load — drop the stale pointer.
        localStorage.removeItem(DRAFT_KEY);
      });
  }, []);

  // Lazily creates the audit the first time it's actually needed (first
  // upload, or Run Audit) rather than forcing an explicit "create" step.
  async function ensureAuditId(): Promise<string> {
    if (auditId) return auditId;
    if (!releaseName.trim()) {
      throw new Error("Enter a release name first");
    }
    const { audit } = await createAudit(releaseName.trim(), description.trim() || undefined);
    setAuditId(audit.id);
    localStorage.setItem(DRAFT_KEY, audit.id);
    return audit.id;
  }

  function handleStartNew() {
    localStorage.removeItem(DRAFT_KEY);
    setAuditId(null);
    setReleaseName("");
    setDescription("");
    setReleaseBriefs([]);
    setContentItems([]);
    setSharepointRequests([]);
    setResumedDraftName(null);
  }

  async function handleNameBlur() {
    if (auditId && releaseName.trim()) {
      await updateAudit(auditId, { release_name: releaseName.trim() }).catch(() => {});
    }
  }

  async function handleDescriptionBlur() {
    if (auditId) {
      await updateAudit(auditId, { description: description.trim() }).catch(() => {});
    }
  }

  async function handleRunAudit() {
    setError(null);
    if (!releaseName.trim()) {
      setError("Enter a release name first");
      return;
    }
    setIsStarting(true);
    try {
      const id = await ensureAuditId();
      // No longer a draft once it's actually running — the Results screen
      // owns it from here, and a future visit to New Audit should start fresh.
      localStorage.removeItem(DRAFT_KEY);
      onAuditReady(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="page">
      <h1>New Audit</h1>

      {resumedDraftName && (
        <p className="new-audit__draft-banner">
          Continuing draft: <strong>{resumedDraftName}</strong> —{" "}
          <button type="button" className="new-audit__draft-banner-link" onClick={handleStartNew}>
            start a new audit instead
          </button>
        </p>
      )}

      <section className="app__section">
        <label className="page__field">
          Release name
          <input
            type="text"
            value={releaseName}
            onChange={(e) => setReleaseName(e.target.value)}
            onBlur={handleNameBlur}
            placeholder="e.g. On-Demand HVAC Self-Service Portal"
          />
        </label>
        <label className="page__field">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleDescriptionBlur}
            rows={4}
            placeholder="What's changing in this release, in your own words"
          />
        </label>
      </section>

      <section className="app__section">
        <h2>Product brief / release docs</h2>
        <p className="app__subtitle">.docx, .pdf, or .pptx — multiple files allowed.</p>
        <ReleaseBriefUpload
          getAuditId={ensureAuditId}
          briefs={releaseBriefs}
          onUploaded={(brief) => setReleaseBriefs((prev) => [...prev, brief])}
        />
      </section>

      <section className="app__section">
        <h2>SharePoint content</h2>
        <p className="app__subtitle">
          Describe what to look for in the Marketing site, then ask Claude (in a chat session) to
          run it — searches and adds what's relevant, no files to find or drag.
        </p>
        <SharePointRequestBox
          getAuditId={ensureAuditId}
          requests={sharepointRequests}
          onCreated={(r) => setSharepointRequests((prev) => [r, ...prev])}
        />
        {contentItems.length > 0 && (
          <p className="app__subtitle">{contentItems.length} SharePoint item(s) added so far.</p>
        )}
        <details className="new-audit__manual-upload">
          <summary>Prefer to add files by hand instead?</summary>
          <SharePointUpload
            getAuditId={ensureAuditId}
            onSaved={(items) => setContentItems((prev) => [...prev, ...items])}
          />
        </details>
      </section>

      {error && <p className="app__error">{error}</p>}

      <button type="button" onClick={handleRunAudit} disabled={isStarting || !releaseName.trim()}>
        {isStarting ? "Starting…" : "Run Audit"}
      </button>
    </div>
  );
}
