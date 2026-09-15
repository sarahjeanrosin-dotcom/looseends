import { useMemo, useState } from "react";
import type { Finding, FindingSource } from "../lib/types";
import { LiftBadge } from "./LiftBadge";

type SourceTab = "all" | FindingSource;
type SortDir = "asc" | "desc";

interface FindingsTableProps {
  auditId: string;
  findings: Finding[];
}

const SOURCE_LABELS: Record<FindingSource, string> = {
  website: "Website",
  sharepoint: "SharePoint",
};

export function FindingsTable({ auditId, findings }: FindingsTableProps) {
  const [sourceTab, setSourceTab] = useState<SourceTab>("all");
  const [minLift, setMinLift] = useState(1);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const relevant = findings.filter((f) => f.relevant);
  const borderline = findings.filter((f) => !f.relevant && f.borderline);

  const counts = {
    all: relevant.length,
    website: relevant.filter((f) => f.source === "website").length,
    sharepoint: relevant.filter((f) => f.source === "sharepoint").length,
  };

  const visibleRelevant = useMemo(() => {
    return relevant
      .filter((f) => sourceTab === "all" || f.source === sourceTab)
      .filter((f) => (f.lift_score ?? 0) >= minLift)
      .sort((a, b) => {
        const diff = (a.lift_score ?? 0) - (b.lift_score ?? 0);
        return sortDir === "asc" ? diff : -diff;
      });
  }, [relevant, sourceTab, minLift, sortDir]);

  const visibleBorderline = borderline.filter((f) => sourceTab === "all" || f.source === sourceTab);

  return (
    <div className="findings-table">
      <div className="findings-table__toolbar">
        <div className="findings-table__tabs">
          <button type="button" className={sourceTab === "all" ? "is-active" : ""} onClick={() => setSourceTab("all")}>
            All ({counts.all})
          </button>
          <button type="button" className={sourceTab === "website" ? "is-active" : ""} onClick={() => setSourceTab("website")}>
            Website ({counts.website})
          </button>
          <button type="button" className={sourceTab === "sharepoint" ? "is-active" : ""} onClick={() => setSourceTab("sharepoint")}>
            SharePoint ({counts.sharepoint})
          </button>
        </div>
        <div className="findings-table__filters">
          <label>
            Min lift:{" "}
            <select value={minLift} onChange={(e) => setMinLift(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <a className="findings-table__csv" href={`/.netlify/functions/export-audit-csv?id=${encodeURIComponent(auditId)}`}>
            Download CSV
          </a>
        </div>
      </div>

      {visibleRelevant.length === 0 ? (
        <p className="app__subtitle">No findings match these filters.</p>
      ) : (
        <table className="findings-table__table">
          <thead>
            <tr>
              <th>Title / URL</th>
              <th>Source</th>
              <th>Legacy copy</th>
              <th>Reason flagged</th>
              <th>Suggested action</th>
              <th>
                <button
                  type="button"
                  className="findings-table__sort"
                  onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                >
                  Lift {sortDir === "asc" ? "▲" : "▼"}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRelevant.map((f) => (
              <tr key={f.id}>
                <td>
                  <strong>{f.title}</strong>
                  <div className="app__saved-path">{f.url_or_path}</div>
                </td>
                <td>{SOURCE_LABELS[f.source]}</td>
                <td>{f.legacy_copy ? <q>{f.legacy_copy}</q> : <span className="app__saved-meta">—</span>}</td>
                <td>{f.reason}</td>
                <td>{f.suggested_action}</td>
                <td>{f.lift_score != null && f.lift_label && <LiftBadge score={f.lift_score} label={f.lift_label} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {visibleBorderline.length > 0 && (
        <div className="findings-table__borderline">
          <h3>Borderline — for your review ({visibleBorderline.length})</h3>
          <p className="app__subtitle">The AI wasn't confident these are unrelated to the release — worth a second look.</p>
          <ul className="app__saved-list">
            {visibleBorderline.map((f) => (
              <li key={f.id}>
                <strong>{f.title}</strong> <span className="app__saved-meta">({SOURCE_LABELS[f.source]})</span>
                <div className="app__saved-path">{f.url_or_path}</div>
                <div className="app__saved-path">{f.reason}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
