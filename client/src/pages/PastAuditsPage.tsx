import { useEffect, useState } from "react";
import { listAudits } from "../lib/api";
import type { AuditWithLiftCounts } from "../lib/types";
import { LiftCountsSummary } from "../components/LiftBadge";

interface PastAuditsPageProps {
  onSelectAudit: (auditId: string) => void;
}

export function PastAuditsPage({ onSelectAudit }: PastAuditsPageProps) {
  const [audits, setAudits] = useState<AuditWithLiftCounts[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAudits()
      .then(({ audits }) => setAudits(Array.isArray(audits) ? audits : []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div className="page">
      <h1>Past Audits</h1>

      {error && <p className="app__error">{error}</p>}

      {audits === null && !error && <p className="app__subtitle">Loading…</p>}

      {audits !== null && audits.length === 0 && (
        <p className="app__subtitle">No audits yet — start one from New Audit.</p>
      )}

      {audits !== null && audits.length > 0 && (
        <table className="findings-table__table">
          <thead>
            <tr>
              <th>Release name</th>
              <th>Date run</th>
              <th>Status</th>
              <th>Findings by lift</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {audits.map((audit) => (
              <tr key={audit.id}>
                <td>
                  <button type="button" className="past-audits__link" onClick={() => onSelectAudit(audit.id)}>
                    {audit.release_name}
                  </button>
                </td>
                <td>{new Date(audit.created_at).toLocaleDateString()}</td>
                <td>{audit.status}</td>
                <td>
                  <LiftCountsSummary counts={audit.liftCounts} />
                </td>
                <td>
                  <a href={`/.netlify/functions/export-audit-csv?id=${encodeURIComponent(audit.id)}`}>CSV</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
