import { blocksToChunks, type Block } from "./chunk";
import type { ParsedChunk } from "@/lib/types";

/**
 * Canvas rich text — syllabus bodies and assignment descriptions — arrives as
 * HTML, not as a file. It goes through the same chunking as PDFs and slides so
 * that downstream nothing can tell where a chunk came from.
 *
 * Headings become locators when the content has them ("Syllabus — Grading"),
 * which reads better in the margin than four notes all saying "Syllabus".
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/&#(\d+);/g, (_, d: string) => codePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => codePoint(parseInt(h, 16)));
}

function codePoint(value: number): string {
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

/** Tags after which a line break belongs, so prose doesn't run together. */
const BREAK_AFTER =
  /<\/(p|div|li|tr|h[1-6]|blockquote|pre|section|article|ul|ol|table|figcaption)>/gi;

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      // Never let markup that isn't content reach the model.
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(td|th)>/gi, " | ")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(BREAK_AFTER, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\| *\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, i, lines) => line || lines[i - 1])
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Splits at h1–h6 so each heading's prose can be cited under its own name. */
function sections(html: string, label: string): Block[] {
  const heading = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const blocks: Block[] = [];

  let cursor = 0;
  let current = label;
  let match: RegExpExecArray | null;

  const push = (raw: string, locator: string) => {
    const text = htmlToText(raw);
    if (text) blocks.push({ locator, text });
  };

  while ((match = heading.exec(html)) !== null) {
    push(html.slice(cursor, match.index), current);

    const title = htmlToText(match[2]).replace(/\s+/g, " ").trim();
    // Keep the heading in the body too — it's often the answer to "what is
    // this section called", and a locator alone isn't in the model's context.
    current = title ? `${label} — ${title}` : label;
    cursor = match.index;
  }

  push(html.slice(cursor), current);
  return blocks;
}

/**
 * @param label What a citation should call this content: "Syllabus",
 *   "Assignment details", "Module outline".
 */
export function parseHtml(html: string, label: string): ParsedChunk[] {
  return blocksToChunks(sections(html, label));
}

/** Canvas fields are often HTML in one course and plain text in another. */
export function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}
