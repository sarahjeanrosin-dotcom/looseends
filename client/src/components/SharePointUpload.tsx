import { useRef, useState } from "react";
import type { ContentItem, NormalizedContentItem, StagedSharePointItem } from "../lib/types";
import "./SharePointUpload.css";

const ACCEPTED_EXTENSIONS = [".docx", ".pdf", ".pptx", ".txt"];

function makeId(): string {
  return crypto.randomUUID();
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./]+$/, "");
}

interface SharePointUploadProps {
  /** Resolves the audit id to save against, creating the audit on first call if needed. */
  getAuditId: () => Promise<string>;
  onSaved: (items: ContentItem[]) => void;
}

export function SharePointUpload({ getAuditId, onSaved }: SharePointUploadProps) {
  const [items, setItems] = useState<StagedSharePointItem[]>([]);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function updateItem(id: string, patch: Partial<StagedSharePointItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function addFiles(fileList: FileList | File[]) {
    // Lazy-loaded: mammoth/jszip/pdfjs are only needed once someone actually
    // uploads a file, so keep them out of the initial page bundle.
    const { extractFile } = await import("../lib/extract");
    const files = Array.from(fileList);
    for (const file of files) {
      const id = makeId();
      setItems((prev) => [
        ...prev,
        {
          id,
          title: stripExtension(file.name),
          contentText: "",
          extractable: false,
          sharepointUrl: "",
          sourceFileName: file.name,
          status: "extracting",
        },
      ]);

      extractFile(file).then((result) => {
        updateItem(id, {
          contentText: result.contentText,
          extractable: result.extractable,
          note: result.note,
          status: result.extractable ? "ready" : "error",
        });
      });
    }
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files.length > 0) {
      addFiles(event.target.files);
    }
    event.target.value = ""; // allow re-selecting the same file
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files);
    }
  }

  function handleAddPasted() {
    if (!pasteText.trim()) return;
    setItems((prev) => [
      ...prev,
      {
        id: makeId(),
        title: pasteTitle.trim() || `Pasted content ${prev.length + 1}`,
        contentText: pasteText.trim(),
        extractable: true,
        sharepointUrl: "",
        status: "ready",
      },
    ]);
    setPasteTitle("");
    setPasteText("");
  }

  function handleRemove(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleSave() {
    setSaveError(null);
    const readyItems = items.filter((item) => item.status !== "extracting");
    if (readyItems.length === 0) return;

    const normalized: NormalizedContentItem[] = readyItems.map((item) => ({
      source: "sharepoint",
      path: item.sharepointUrl.trim() || item.sourceFileName || item.title,
      title: item.title.trim() || item.sourceFileName || "Untitled",
      contentText: item.contentText,
      extractable: item.extractable,
    }));

    setIsSaving(true);
    try {
      const auditId = await getAuditId();
      const res = await fetch("/.netlify/functions/add-content-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit_id: auditId, items: normalized }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? `Request failed with status ${res.status}`);
      }
      onSaved(body.contentItems as ContentItem[]);
      setItems([]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }

  const readyCount = items.filter((item) => item.status === "ready").length;
  const hasExtracting = items.some((item) => item.status === "extracting");

  return (
    <div className="sharepoint-upload">
      <div
        className={`sharepoint-upload__dropzone${isDragOver ? " sharepoint-upload__dropzone--active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <p>Drop SharePoint files here, or click to browse</p>
        <p className="sharepoint-upload__hint">Accepts {ACCEPTED_EXTENSIONS.join(", ")}</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={handleFileInputChange}
          style={{ display: "none" }}
        />
      </div>

      <div className="sharepoint-upload__paste">
        <input
          type="text"
          placeholder="Title (optional)"
          value={pasteTitle}
          onChange={(e) => setPasteTitle(e.target.value)}
        />
        <textarea
          placeholder="Or paste plain text content directly…"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={3}
        />
        <button type="button" onClick={handleAddPasted} disabled={!pasteText.trim()}>
          Add pasted content
        </button>
      </div>

      {items.length > 0 && (
        <ul className="sharepoint-upload__items">
          {items.map((item) => (
            <li key={item.id} className="sharepoint-upload__item">
              <div className="sharepoint-upload__item-row">
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => updateItem(item.id, { title: e.target.value })}
                  className="sharepoint-upload__title-input"
                />
                {item.status === "extracting" && <span className="badge badge--pending">Extracting…</span>}
                {item.status === "ready" && <span className="badge badge--ok">Extracted</span>}
                {item.status === "error" && <span className="badge badge--warn">Not extractable</span>}
                <button type="button" onClick={() => handleRemove(item.id)} aria-label="Remove">
                  ✕
                </button>
              </div>
              {item.note && <p className="sharepoint-upload__note">{item.note}</p>}
              {item.status === "ready" && (
                <p className="sharepoint-upload__preview">
                  {item.contentText.slice(0, 240)}
                  {item.contentText.length > 240 ? "…" : ""}
                </p>
              )}
              <input
                type="text"
                placeholder="SharePoint URL (optional reference link)"
                value={item.sharepointUrl}
                onChange={(e) => updateItem(item.id, { sharepointUrl: e.target.value })}
                className="sharepoint-upload__url-input"
              />
            </li>
          ))}
        </ul>
      )}

      {saveError && <p className="sharepoint-upload__error">{saveError}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={items.length === 0 || hasExtracting || isSaving}
      >
        {isSaving ? "Saving…" : `Save ${readyCount || ""} item${readyCount === 1 ? "" : "s"} to audit`}
      </button>
    </div>
  );
}
