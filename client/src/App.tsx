import { useEffect, useState } from "react";
import { SharePointUpload } from "./components/SharePointUpload";
import { createAudit, getAudit, listAudits } from "./lib/api";
import type { Audit, ContentItem } from "./lib/types";
import "./App.css";

// Stage 1 test harness: a minimal way to pick/create an audit and exercise
// the SharePoint upload step end to end. Stage 4 replaces this with the real
// "New Audit" / "Audit Results" screens.
function App() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<string>("");
  const [newReleaseName, setNewReleaseName] = useState("");
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function refreshAudits() {
    try {
      const { audits } = await listAudits();
      setAudits(audits);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refreshAudits();
  }, []);

  useEffect(() => {
    if (!selectedAuditId) {
      setContentItems([]);
      return;
    }
    getAudit(selectedAuditId)
      .then(({ contentItems }) => setContentItems(contentItems))
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [selectedAuditId]);

  async function handleCreateAudit() {
    if (!newReleaseName.trim()) return;
    setIsCreating(true);
    setLoadError(null);
    try {
      const { audit } = await createAudit(newReleaseName.trim());
      setNewReleaseName("");
      await refreshAudits();
      setSelectedAuditId(audit.id);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  }

  function handleSaved(saved: ContentItem[]) {
    setContentItems((prev) => [...prev, ...saved]);
  }

  return (
    <main className="app">
      <h1>Release Impact Finder</h1>
      <p className="app__subtitle">Stage 1: SharePoint content upload</p>

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
          <button type="button" onClick={handleCreateAudit} disabled={isCreating || !newReleaseName.trim()}>
            {isCreating ? "Creating…" : "Create audit"}
          </button>
        </div>
      </section>

      {selectedAuditId && (
        <section className="app__section">
          <h2>2. Upload SharePoint content</h2>
          <SharePointUpload auditId={selectedAuditId} onSaved={handleSaved} />
        </section>
      )}

      {selectedAuditId && (
        <section className="app__section">
          <h2>3. Saved content items ({contentItems.length})</h2>
          {contentItems.length === 0 ? (
            <p className="app__subtitle">Nothing saved for this audit yet.</p>
          ) : (
            <ul className="app__saved-list">
              {contentItems.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>{" "}
                  <span className="app__saved-meta">
                    ({item.source}, {item.extractable ? "extracted" : "not extractable"})
                  </span>
                  <div className="app__saved-path">{item.url_or_path}</div>
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
