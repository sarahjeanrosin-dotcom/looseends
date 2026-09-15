import { useState } from "react";
import { SharePointUpload } from "../components/SharePointUpload";
import { ReleaseBriefUpload } from "../components/ReleaseBriefUpload";
import { createAudit, updateAudit } from "../lib/api";
import type { ContentItem, ReleaseBrief } from "../lib/types";

interface NewAuditPageProps {
  /** Called once the audit exists and Run Audit is clicked — navigates to the Results screen. */
  onAuditReady: (auditId: string) => void;
}

export function NewAuditPage({ onAuditReady }: NewAuditPageProps) {
  const [releaseName, setReleaseName] = useState("");
  const [description, setDescription] = useState("");
  const [auditId, setAuditId] = useState<string | null>(null);
  const [releaseBriefs, setReleaseBriefs] = useState<ReleaseBrief[]>([]);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Lazily creates the audit the first time it's actually needed (first
  // upload, or Run Audit) rather than forcing an explicit "create" step.
  async function ensureAuditId(): Promise<string> {
    if (auditId) return auditId;
    if (!releaseName.trim()) {
      throw new Error("Enter a release name first");
    }
    const { audit } = await createAudit(releaseName.trim(), description.trim() || undefined);
    setAuditId(audit.id);
    return audit.id;
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
          Ask Claude, in plain language, to pull it for you — e.g. <em>"pull SharePoint content
          for this audit about [topic]."</em> It searches the Marketing site, reads what's
          relevant, and adds it directly. No files to find or drag.
        </p>
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
