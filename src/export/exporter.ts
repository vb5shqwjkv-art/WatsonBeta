import { Packer } from "docx";
import type { JsonValue } from "@/lib/json";
import { buildDocxDocument } from "./pm-to-docx";

/** Export formats the user can request (by button or by voice). */
export type ExportFormat = "pdf" | "docx";

function sanitizeFilename(name: string): string {
  return (name || "documento").trim().replace(/[^\w\-]+/g, "_").slice(0, 80);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build a real .docx from the document content and download it. */
export async function exportDocx(content: JsonValue, title: string): Promise<void> {
  const doc = buildDocxDocument(content, title);
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${sanitizeFilename(title)}.docx`);
}

/**
 * Produce a PDF via the browser's print pipeline (Save as PDF). Print styles in
 * globals.css strip the UI and lay the document out on A4 — faithful to the
 * on-screen colors, sizes, and structure.
 */
export function exportPdf(title: string): void {
  const previous = document.title;
  document.title = sanitizeFilename(title);
  window.print();
  // Restore after the print dialog is dismissed.
  setTimeout(() => {
    document.title = previous;
  }, 500);
}
