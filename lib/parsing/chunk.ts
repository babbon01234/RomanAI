import type { ParsedChunk } from "@/lib/types";

/**
 * A unit of text as it came out of a file, before size normalisation —
 * one slide, one page, one run of paragraphs.
 */
export interface Block {
  locator: string;
  text: string;
}

/** Chunks above this get split; below it they stay whole. */
const MAX_CHARS = 1600;
/** Anything shorter than this isn't worth citing on its own. */
const MIN_CHARS = 25;

export function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/**
 * Split on paragraph breaks first, then sentence breaks, so a chunk never
 * ends mid-sentence — citations read badly when they do.
 */
function split(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];

  const pieces: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) pieces.push(current.trim());
    current = "";
  };

  for (const para of text.split(/\n{2,}/)) {
    if (para.length > MAX_CHARS) {
      flush();
      for (const sentence of para.split(/(?<=[.!?])\s+/)) {
        if (current.length + sentence.length > MAX_CHARS) flush();
        current += (current ? " " : "") + sentence;
      }
      flush();
      continue;
    }

    if (current.length + para.length > MAX_CHARS) flush();
    current += (current ? "\n\n" : "") + para;
  }

  flush();
  return pieces;
}

/**
 * Turn parser output into storable chunks. When a block splits, the locator
 * is suffixed ("Page 2 (cont.)") so the citation stays honest.
 */
export function blocksToChunks(blocks: Block[]): ParsedChunk[] {
  const chunks: ParsedChunk[] = [];

  for (const block of blocks) {
    const text = normalize(block.text);
    if (text.length < MIN_CHARS) continue;

    split(text).forEach((content, i) => {
      chunks.push({
        locator: i === 0 ? block.locator : `${block.locator} (cont.)`,
        content,
      });
    });
  }

  return chunks;
}
