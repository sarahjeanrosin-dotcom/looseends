import { useEffect, useState } from "react";
import { NewAuditPage } from "./pages/NewAuditPage";
import { AuditResultsPage } from "./pages/AuditResultsPage";
import { PastAuditsPage } from "./pages/PastAuditsPage";
import "./App.css";

// No router library — the app is three screens, navigation is plain state
// synced to the URL (?view=past or ?audit=<id>) so a reload/share doesn't
// lose your place.
type Tab = "new" | "past";

function currentAuditIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("audit");
}

function App() {
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get("view") === "past" ? "past" : "new"));
  const [auditId, setAuditId] = useState<string | null>(currentAuditIdFromUrl);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    url.searchParams.delete("audit");
    if (auditId) {
      url.searchParams.set("audit", auditId);
    } else if (tab === "past") {
      url.searchParams.set("view", "past");
    }
    window.history.replaceState({}, "", url);
  }, [tab, auditId]);

  function goToTab(next: Tab) {
    setAuditId(null);
    setTab(next);
  }

  return (
    <>
      <nav className="topnav">
        <button type="button" className={!auditId && tab === "new" ? "is-active" : ""} onClick={() => goToTab("new")}>
          New Audit
        </button>
        <button type="button" className={!auditId && tab === "past" ? "is-active" : ""} onClick={() => goToTab("past")}>
          Past Audits
        </button>
      </nav>

      {auditId ? (
        <AuditResultsPage auditId={auditId} onBack={() => goToTab("past")} />
      ) : tab === "past" ? (
        <PastAuditsPage onSelectAudit={setAuditId} />
      ) : (
        <NewAuditPage onAuditReady={setAuditId} />
      )}
    </>
  );
}

export default App;
