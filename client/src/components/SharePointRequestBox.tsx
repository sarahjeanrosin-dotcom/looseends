import { useState } from "react";
import { createSharepointRequest } from "../lib/api";
import type { SharePointRequest } from "../lib/types";

interface SharePointRequestBoxProps {
  /** Resolves the audit id to attach the request to, creating the audit on first call if needed. */
  getAuditId: () => Promise<string>;
  requests: SharePointRequest[];
  onCreated: (request: SharePointRequest) => void;
}

const STATUS_LABEL: Record<SharePointRequest["status"], string> = {
  pending: "Queued — ask Claude to run it",
  fulfilled: "Done",
  failed: "Failed",
};

const STATUS_BADGE_CLASS: Record<SharePointRequest["status"], string> = {
  pending: "badge badge--pending",
  fulfilled: "badge badge--ok",
  failed: "badge badge--warn",
};

export function SharePointRequestBox({ getAuditId, requests, onCreated }: SharePointRequestBoxProps) {
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!prompt.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const auditId = await getAuditId();
      const { sharepointRequest } = await createSharepointRequest(auditId, prompt.trim());
      onCreated(sharepointRequest);
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <div className="sharepoint-request__form">
        <input
          type="text"
          placeholder='e.g. "Search Marketing for wallet-based mobile credential content"'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
        />
        <button type="button" onClick={handleSubmit} disabled={isSubmitting || !prompt.trim()}>
          {isSubmitting ? "Queuing…" : "Ask Claude to search SharePoint"}
        </button>
      </div>
      {error && <p className="app__error">{error}</p>}

      {requests.length > 0 && (
        <ul className="app__saved-list">
          {requests.map((r) => (
            <li key={r.id}>
              <span className={STATUS_BADGE_CLASS[r.status]}>{STATUS_LABEL[r.status]}</span>{" "}
              <strong>{r.prompt}</strong>
              {r.summary && <div className="app__saved-path">{r.summary}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
