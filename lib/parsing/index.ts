import { parseDocx } from "./docx";
import { parsePdf } from "./pdf";
import { parsePptx } from "./pptx";
import type { FileKind, ParsedChunk } from "@/lib/types";

export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".pptx"] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(",");

/** Kinds that come from actual bytes. "html" is rich text and parses elsewhere. */
export type DocumentKind = Exclude<FileKind, "html">;

export function kindFromFilename(filename: string): DocumentKind | null {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  if (ext === ".pptx") return "pptx";
  return null;
}

export async function parseFile(
  buffer: Buffer,
  kind: DocumentKind,
): Promise<ParsedChunk[]> {
  const chunks =
    kind === "pdf"
      ? await parsePdf(buffer)
      : kind === "docx"
        ? await parseDocx(buffer)
        : await parsePptx(buffer);

  if (chunks.length === 0) {
    throw new Error(
      "No text could be read from this file. If it's a scanned document, students won't be able to ask about it.",
    );
  }

  return chunks;
}
