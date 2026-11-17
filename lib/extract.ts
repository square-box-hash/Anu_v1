"use client";

/**
 * Reads a file's text in the browser, so the contents never leave the machine —
 * only the extracted text travels with the request. PDFs and Word documents are
 * parsed client-side; anything we cannot read says so instead of pretending the
 * model received it.
 */

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PDF_PAGES = 200;
const MAX_CHARS = 400_000;

const TEXT_EXTENSIONS =
  /\.(md|markdown|txt|text|csv|tsv|json|jsonl|ya?ml|toml|ini|cfg|log|html?|css|scss|tsx?|jsx?|mjs|cjs|py|rs|go|java|kt|c|h|cpp|cs|rb|php|sh|sql|xml|env)$/i;

export interface Extraction {
  /** Extracted plain text, when we could read the file. */
  text?: string;
  /** Why nothing was extracted — shown to the user rather than swallowed. */
  note?: string;
}

export function canExtract(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("text/") ||
    TEXT_EXTENSIONS.test(name) ||
    file.type === "application/pdf" ||
    name.endsWith(".pdf") ||
    name.endsWith(".docx")
  );
}

export async function extractText(file: File): Promise<Extraction> {
  const name = file.name.toLowerCase();

  if (file.size > MAX_BYTES) {
    return { note: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — too large to read in the browser.` };
  }

  try {
    if (file.type.startsWith("text/") || TEXT_EXTENSIONS.test(name)) {
      return { text: clamp(await file.text()) };
    }
    if (file.type === "application/pdf" || name.endsWith(".pdf")) {
      return await extractPdf(file);
    }
    if (name.endsWith(".docx")) {
      return await extractDocx(file);
    }
  } catch (error) {
    return {
      note: `${file.name}: could not be read (${error instanceof Error ? error.message : "unknown error"}).`,
    };
  }

  return { note: `${file.name}: this file type can't be read as text yet.` };
}

function clamp(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  return `${text.slice(0, MAX_CHARS)}\n\n[truncated at ${MAX_CHARS.toLocaleString()} characters]`;
}

async function extractPdf(file: File): Promise<Extraction> {
  // Imported lazily so the parser is a separate chunk, not part of the initial load.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;

  const pages: string[] = [];
  const limit = Math.min(doc.numPages, MAX_PDF_PAGES);

  for (let page = 1; page <= limit; page++) {
    const loaded = await doc.getPage(page);
    const content = await loaded.getTextContent();
    const text = content.items
      .map((item: { str?: string }) => item.str ?? "")
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (text) pages.push(text);
  }

  const joined = pages.join("\n\n").trim();
  if (!joined) {
    return { note: `${file.name}: no selectable text — it looks like a scanned PDF.` };
  }

  const suffix = doc.numPages > limit ? `\n\n[first ${limit} of ${doc.numPages} pages]` : "";
  return { text: clamp(`${joined}${suffix}`) };
}

async function extractDocx(file: File): Promise<Extraction> {
  const mammoth = await import("mammoth/mammoth.browser");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = String(result?.value ?? "").trim();
  if (!text) return { note: `${file.name}: the document appears to be empty.` };
  return { text: clamp(text) };
}
