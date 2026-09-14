import { useEffect, useState } from "react";
import { NewAuditPage } from "./pages/NewAuditPage";
import { AuditResultsPage } from "./pages/AuditResultsPage";
import "./App.css";

// Stage 4: New Audit + Audit Results screens. No router library — the app
// is two screens, navigation is plain state synced to a `?audit=` query
// param so a results page reload/share doesn't lose your place. Stage 6
// adds a "Past Audits" list; that's the natural point to add real routing.
function App() {
  const [auditId, setAuditId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("audit")
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (auditId) {
      url.searchParams.set("audit", auditId);
    } else {
      url.searchParams.delete("audit");
    }
    window.history.replaceState({}, "", url);
  }, [auditId]);

  if (auditId) {
    return <AuditResultsPage auditId={auditId} onBack={() => setAuditId(null)} />;
  }
  return <NewAuditPage onAuditReady={setAuditId} />;
}

export default App;
