import { useRef, useState } from "react";
import { createBriefUploadUrl, finalizeReleaseBrief } from "../lib/api";
import type { Audit } from "../lib/types";

type Status = "idle" | "extracting" | "uploading" | "done" | "error";

interface ReleaseBriefUploadProps {
  auditId: string;
  audit: Audit;
  onUploaded: (audit: Audit) => void;
}

export function ReleaseBriefUpload({ auditId, audit, onUploaded }: ReleaseBriefUploadProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    try {
      setStatus("extracting");
      // Lazy-loaded, same as SharePointUpload — mammoth/jszip/pdfjs only
      // needed once someone actually uploads a file.
      const { extractFile } = await import("../lib/extract");
      const extracted = await extractFile(file);

      setStatus("uploading");
      const { path, signedUrl } = await createBriefUploadUrl(auditId, file.name);
      const putRes = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) {
        throw new Error(`Uploading the file to storage failed (HTTP ${putRes.status})`);
      }

      const { audit: updated } = await finalizeReleaseBrief(auditId, path, extracted.contentText);
      setStatus("done");
      onUploaded(updated);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) handleFile(file);
    event.target.value = "";
  }

  const hasBrief = !!audit.brief_file_path;

  return (
    <div>
      {hasBrief && status !== "extracting" && status !== "uploading" && (
        <p className="app__subtitle">
          Current brief: {audit.brief_file_path?.split("/").pop()}
          {audit.brief_content_text ? ` (${audit.brief_content_text.length} chars extracted)` : " (no text extracted)"}
        </p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.pdf,.pptx,.txt"
        onChange={handleFileInputChange}
        style={{ display: "none" }}
      />
      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={status === "extracting" || status === "uploading"}>
        {status === "extracting" && `Extracting ${fileName}…`}
        {status === "uploading" && `Uploading ${fileName}…`}
        {(status === "idle" || status === "done" || status === "error") && (hasBrief ? "Replace product brief" : "Upload product brief")}
      </button>
      {error && <p className="app__error">{error}</p>}
    </div>
  );
}
