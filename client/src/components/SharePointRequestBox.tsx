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
  pending: "Received — waiting for Claude to search",
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
  // The prompt just submitted, shown as an explicit acknowledgment banner —
  // "it's in the list" isn't obviously enough confirmation on its own that
  // the request was actually received, especially the first time.
  const [justAcknowledged, setJustAcknowledged] = useState<string | null>(null);

  async function handleSubmit() {
    if (!prompt.trim()) return;
    setError(null);
    setJustAcknowledged(null);
    setIsSubmitting(true);
    try {
      const auditId = await getAuditId();
      const submittedPrompt = prompt.trim();
      const { sharepointRequest } = await createSharepointRequest(auditId, submittedPrompt);
      onCreated(sharepointRequest);
      setPrompt("");
      setJustAcknowledged(submittedPrompt);
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

      {justAcknowledged && (
        <p className="sharepoint-request__ack">
          ✓ Received: <em>"{justAcknowledged}"</em> — queued. Ask Claude, in a chat session, to run
          it whenever you're ready.{" "}
          <button type="button" className="sharepoint-request__ack-dismiss" onClick={() => setJustAcknowledged(null)}>
            Dismiss
          </button>
        </p>
      )}

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
