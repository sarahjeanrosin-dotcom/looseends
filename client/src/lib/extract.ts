// Client-side text extraction for the SharePoint content upload step (Stage 1).
// Runs entirely in the browser — nothing here uploads the raw file anywhere;
// only the extracted plain text ever gets sent to the Netlify Function.
import mammoth from "mammoth";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
// eslint-disable-next-line import/no-unresolved
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface ExtractResult {
  contentText: string;
  extractable: boolean;
  /** Present when extraction failed or was skipped, for surfacing in the UI. */
  note?: string;
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXmlEntities(text: string): string {
  return text.replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, (entity) => XML_ENTITIES[entity]);
}

async function extractDocxText(arrayBuffer: ArrayBuffer): Promise<ExtractResult> {
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value.trim();
  return { contentText: text, extractable: text.length > 0 };
}

/**
 * .pptx is a zip of XML files, one per slide, under ppt/slides/slideN.xml.
 * Text runs live in <a:t> elements. We pull those out with a regex rather
 * than a full XML/DOM parser — good enough for plain slide text, which is
 * all the AI relevance pass (Stage 3) needs.
 */
async function extractPptxText(arrayBuffer: ArrayBuffer): Promise<ExtractResult> {
  const zip = await JSZip.loadAsync(arrayBuffer);

  const slideFiles = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => {
      const numA = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      const numB = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return numA - numB;
    });

  if (slideFiles.length === 0) {
    return { contentText: "", extractable: false, note: "No slides found in .pptx" };
  }

  const slideTexts: string[] = [];
  for (const path of slideFiles) {
    const xml = await zip.files[path].async("string");
    const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]));
    if (runs.length > 0) {
      slideTexts.push(runs.join(" "));
    }
  }

  const text = slideTexts.join("\n\n").trim();
  return { contentText: text, extractable: text.length > 0 };
}

// Below this many characters of extracted text, treat a PDF as scanned/image-only
// rather than claim we successfully extracted its content.
const PDF_MIN_EXTRACTABLE_CHARS = 20;

async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<ExtractResult> {
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim();
    if (pageText) pageTexts.push(pageText);
  }

  const text = pageTexts.join("\n\n").trim();
  if (text.length < PDF_MIN_EXTRACTABLE_CHARS) {
    return {
      contentText: text,
      extractable: false,
      note: "PDF appears to be scanned/image-only — little or no extractable text found",
    };
  }
  return { contentText: text, extractable: true };
}

/** Extracts title + plain text content from an uploaded SharePoint file. */
export async function extractFile(file: File): Promise<ExtractResult> {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";

  try {
    if (extension === "docx") {
      const buf = await file.arrayBuffer();
      return await extractDocxText(buf);
    }
    if (extension === "pptx") {
      const buf = await file.arrayBuffer();
      return await extractPptxText(buf);
    }
    if (extension === "pdf") {
      const buf = await file.arrayBuffer();
      return await extractPdfText(buf);
    }
    if (extension === "txt") {
      const text = (await file.text()).trim();
      return { contentText: text, extractable: text.length > 0 };
    }
    return {
      contentText: "",
      extractable: false,
      note: `Unsupported file type ".${extension}" — accepted types: .docx, .pdf, .pptx, .txt`,
    };
  } catch (err) {
    return {
      contentText: "",
      extractable: false,
      note: `Failed to extract text: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
