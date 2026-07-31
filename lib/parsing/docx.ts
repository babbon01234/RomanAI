import mammoth from "mammoth";
import { blocksToChunks, normalize, type Block } from "./chunk";
import type { ParsedChunk } from "@/lib/types";

/** Roughly how much prose belongs under one "Section N" citation. */
const SECTION_CHARS = 1200;

/**
 * A .docx has no pages until it's laid out, so "Page 2" would be a lie. We
 * group paragraphs into numbered sections instead and cite those.
 */
export async function parseDocx(buffer: Buffer): Promise<ParsedChunk[]> {
  const { value } = await mammoth.extractRawText({ buffer });

  const paragraphs = normalize(value)
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    throw new Error("No readable text found in the document.");
  }

  const blocks: Block[] = [];
  let current: string[] = [];
  let length = 0;

  const flush = () => {
    if (!current.length) return;
    blocks.push({
      locator: `Section ${blocks.length + 1}`,
      text: current.join("\n\n"),
    });
    current = [];
    length = 0;
  };

  for (const paragraph of paragraphs) {
    if (length && length + paragraph.length > SECTION_CHARS) flush();
    current.push(paragraph);
    length += paragraph.length;
  }
  flush();

  return blocksToChunks(blocks);
}
