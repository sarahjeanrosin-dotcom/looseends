import { useEffect, useState } from "react";
import { deleteAudit, listAudits } from "../lib/api";
import type { AuditWithLiftCounts } from "../lib/types";
import { LiftCountsSummary } from "../components/LiftBadge";

interface PastAuditsPageProps {
  onSelectAudit: (auditId: string) => void;
}

export function PastAuditsPage({ onSelectAudit }: PastAuditsPageProps) {
  const [audits, setAudits] = useState<AuditWithLiftCounts[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    listAudits()
      .then(({ audits }) => setAudits(Array.isArray(audits) ? audits : []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function handleDelete(audit: AuditWithLiftCounts) {
    if (!window.confirm(`Delete "${audit.release_name}"? This removes all its findings and content, and can't be undone.`)) {
      return;
    }
    setDeleteError(null);
    setDeletingId(audit.id);
    try {
      await deleteAudit(audit.id);
      setAudits((prev) => (prev ? prev.filter((a) => a.id !== audit.id) : prev));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="page">
      <h1>Past Audits</h1>

      {error && <p className="app__error">{error}</p>}
      {deleteError && <p className="app__error">{deleteError}</p>}

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
                  <details className="past-audits__menu">
                    <summary className="past-audits__menu-trigger" aria-label="Audit actions">
                      ⋮
                    </summary>
                    <div className="past-audits__menu-items">
                      <a href={`/.netlify/functions/export-audit-csv?id=${encodeURIComponent(audit.id)}`}>
                        Download CSV
                      </a>
                      <button
                        type="button"
                        className="past-audits__menu-delete"
                        onClick={() => handleDelete(audit)}
                        disabled={deletingId === audit.id}
                      >
                        {deletingId === audit.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
