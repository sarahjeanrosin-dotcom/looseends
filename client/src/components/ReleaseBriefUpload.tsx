import { useRef, useState } from "react";
import { createBriefUploadUrl, finalizeReleaseBrief } from "../lib/api";
import type { ReleaseBrief } from "../lib/types";

const ACCEPTED_EXTENSIONS = [".docx", ".pdf", ".pptx", ".txt"];

interface UploadingFile {
  id: string;
  fileName: string;
  status: "extracting" | "uploading" | "error";
  error?: string;
}

interface ReleaseBriefUploadProps {
  /** Resolves the audit id to attach briefs to, creating the audit on first call if needed. */
  getAuditId: () => Promise<string>;
  briefs: ReleaseBrief[];
  onUploaded: (brief: ReleaseBrief) => void;
}

export function ReleaseBriefUpload({ getAuditId, briefs, onUploaded }: ReleaseBriefUploadProps) {
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadOne(file: File) {
    const id = crypto.randomUUID();
    setUploading((prev) => [...prev, { id, fileName: file.name, status: "extracting" }]);

    try {
      // Lazy-loaded, same as SharePointUpload — mammoth/jszip/pdfjs only
      // needed once someone actually uploads a file.
      const { extractFile } = await import("../lib/extract");
      const extracted = await extractFile(file);

      setUploading((prev) => prev.map((u) => (u.id === id ? { ...u, status: "uploading" } : u)));

      const auditId = await getAuditId();
      const { path, signedUrl } = await createBriefUploadUrl(auditId, file.name);
      const putRes = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) {
        throw new Error(`Uploading the file to storage failed (HTTP ${putRes.status})`);
      }

      const { releaseBrief } = await finalizeReleaseBrief(auditId, path, file.name, extracted.contentText);
      onUploaded(releaseBrief);
      setUploading((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      setUploading((prev) =>
        prev.map((u) => (u.id === id ? { ...u, status: "error", error: err instanceof Error ? err.message : String(err) } : u))
      );
    }
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (files) {
      Array.from(files).forEach((file) => uploadOne(file));
    }
    event.target.value = "";
  }

  return (
    <div>
      {briefs.length > 0 && (
        <ul className="app__saved-list">
          {briefs.map((b) => (
            <li key={b.id}>
              <strong>{b.file_name}</strong>{" "}
              <span className="app__saved-meta">({b.content_text.length} chars extracted)</span>
            </li>
          ))}
        </ul>
      )}
      {uploading.map((u) => (
        <p key={u.id} className={u.status === "error" ? "app__error" : "app__subtitle"}>
          {u.fileName}: {u.status === "extracting" ? "Extracting…" : u.status === "uploading" ? "Uploading…" : `Error — ${u.error}`}
        </p>
      ))}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(",")}
        onChange={handleFileInputChange}
        style={{ display: "none" }}
      />
      <button type="button" onClick={() => fileInputRef.current?.click()}>
        Upload product brief / release docs
      </button>
    </div>
  );
}
