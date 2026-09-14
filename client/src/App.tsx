import { useEffect, useState } from "react";
import { SharePointUpload } from "./components/SharePointUpload";
import { ReleaseBriefUpload } from "./components/ReleaseBriefUpload";
import { createAudit, getAudit, listAudits, runAuditPassChunk } from "./lib/api";
import type { Audit, ContentItem, Finding } from "./lib/types";
import "./App.css";

// Stages 1-3 test harness: a minimal way to pick/create an audit, upload
// content, and run the AI matching pass end to end. Stage 4 replaces this
// with the real New Audit / Audit Results screens.
function App() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<string>("");
  const [selectedAudit, setSelectedAudit] = useState<Audit | null>(null);
  const [newReleaseName, setNewReleaseName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  async function refreshAudits() {
    try {
      const { audits } = await listAudits();
      setAudits(audits);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  async function refreshSelectedAudit() {
    if (!selectedAuditId) return;
    try {
      const { audit, contentItems, findings } = await getAudit(selectedAuditId);
      setSelectedAudit(audit);
      setContentItems(contentItems);
      setFindings(findings);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refreshAudits();
  }, []);

  useEffect(() => {
    if (!selectedAuditId) {
      setSelectedAudit(null);
      setContentItems([]);
      setFindings([]);
      return;
    }
    refreshSelectedAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAuditId]);

  async function handleCreateAudit() {
    if (!newReleaseName.trim()) return;
    setIsCreating(true);
    setLoadError(null);
    try {
      const { audit } = await createAudit(newReleaseName.trim(), newDescription.trim() || undefined);
      setNewReleaseName("");
      setNewDescription("");
      await refreshAudits();
      setSelectedAuditId(audit.id);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  }

  function handleContentSaved(saved: ContentItem[]) {
    setContentItems((prev) => [...prev, ...saved]);
  }

  async function handleRunAudit() {
    if (!selectedAuditId) return;
    setIsRunning(true);
    setRunError(null);
    try {
      let done = false;
      while (!done) {
        const result = await runAuditPassChunk(selectedAuditId);
        done = result.done;
        setSelectedAudit((prev) =>
          prev ? { ...prev, progress: done ? 100 : Math.round((result.processedItems / result.totalItems) * 100), status: done ? "complete" : "running" } : prev
        );
      }
      await refreshSelectedAudit();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="app">
      <h1>Release Impact Finder</h1>
      <p className="app__subtitle">Stages 1-3 test harness</p>

      {loadError && <p className="app__error">{loadError}</p>}

      <section className="app__section">
        <h2>1. Pick or create an audit</h2>
        <div className="app__audit-picker">
          <select value={selectedAuditId} onChange={(e) => setSelectedAuditId(e.target.value)}>
            <option value="">— Select an audit —</option>
            {audits.map((audit) => (
              <option key={audit.id} value={audit.id}>
                {audit.release_name} ({new Date(audit.created_at).toLocaleString()})
              </option>
            ))}
          </select>
        </div>
        <div className="app__audit-create">
          <input
            type="text"
            placeholder="New release name"
            value={newReleaseName}
            onChange={(e) => setNewReleaseName(e.target.value)}
          />
          <textarea
            placeholder="Release description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={2}
          />
          <button type="button" onClick={handleCreateAudit} disabled={isCreating || !newReleaseName.trim()}>
            {isCreating ? "Creating…" : "Create audit"}
          </button>
        </div>
      </section>

      {selectedAuditId && selectedAudit && (
        <section className="app__section">
          <h2>2. Release context</h2>
          <p className="app__subtitle">
            {selectedAudit.release_name}
            {selectedAudit.description ? ` — ${selectedAudit.description}` : ""}
          </p>
          <ReleaseBriefUpload
            auditId={selectedAuditId}
            audit={selectedAudit}
            onUploaded={(audit) => setSelectedAudit(audit)}
          />
        </section>
      )}

      {selectedAuditId && (
        <section className="app__section">
          <h2>3. Upload SharePoint content</h2>
          <SharePointUpload auditId={selectedAuditId} onSaved={handleContentSaved} />
        </section>
      )}

      {selectedAuditId && (
        <section className="app__section">
          <h2>4. Saved content items ({contentItems.length})</h2>
          {contentItems.length === 0 ? (
            <p className="app__subtitle">Nothing saved for this audit yet — upload SharePoint content or crawl the website.</p>
          ) : (
            <ul className="app__saved-list">
              {contentItems.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>{" "}
                  <span className="app__saved-meta">
                    ({item.source}, {item.extractable ? "extracted" : "not extractable"}
                    {item.processed ? ", processed" : ""})
                  </span>
                  <div className="app__saved-path">{item.url_or_path}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {selectedAuditId && selectedAudit && (
        <section className="app__section">
          <h2>5. Run AI matching</h2>
          <p className="app__subtitle">
            Status: {selectedAudit.status} — {selectedAudit.progress}%
          </p>
          <button type="button" onClick={handleRunAudit} disabled={isRunning || contentItems.length === 0}>
            {isRunning ? "Running…" : "Run AI matching"}
          </button>
          {runError && <p className="app__error">{runError}</p>}
        </section>
      )}

      {selectedAuditId && (
        <section className="app__section">
          <h2>6. Findings ({findings.length})</h2>
          {findings.length === 0 ? (
            <p className="app__subtitle">No findings yet.</p>
          ) : (
            <ul className="app__saved-list">
              {findings.map((f) => (
                <li key={f.id}>
                  <span className={`badge ${f.relevant ? "badge--ok" : "badge--warn"}`}>
                    {f.relevant ? `Lift ${f.lift_score}/5 ${f.lift_label}` : "Borderline"}
                  </span>{" "}
                  <strong>{f.title}</strong>{" "}
                  <span className="app__saved-meta">({f.source})</span>
                  <div className="app__saved-path">{f.reason}</div>
                  {f.suggested_action && <div className="app__saved-path">→ {f.suggested_action}</div>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
