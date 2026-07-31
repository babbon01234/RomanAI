import JSZip from "jszip";
import { blocksToChunks, type Block } from "./chunk";
import type { ParsedChunk } from "@/lib/types";

/**
 * A .pptx is a zip of XML. Rather than pull in a heavyweight library we unzip
 * it, walk ppt/slides/slideN.xml in slide order, and pull the text runs out of
 * the <a:t> tags. Keeping the slide number is the whole point — it's what makes
 * a citation say "Slide 4".
 */

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m])
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function slideText(xml: string): string {
  // Paragraphs (<a:p>) become line breaks; text runs (<a:t>) become content.
  return xml
    .split(/<a:p[\s>]/)
    .map((para) =>
      Array.from(para.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
        .map((m) => decodeEntities(m[1]))
        .join(""),
    )
    .filter((line) => line.trim())
    .join("\n");
}

export async function parsePptx(buffer: Buffer): Promise<ParsedChunk[]> {
  const zip = await JSZip.loadAsync(buffer);

  const slides = Object.keys(zip.files)
    .map((path) => ({ path, match: /^ppt\/slides\/slide(\d+)\.xml$/.exec(path) }))
    .filter((f): f is { path: string; match: RegExpExecArray } => f.match !== null)
    .map(({ path, match }) => ({ path, number: Number(match[1]) }))
    // Numeric sort — a plain string sort puts slide10 before slide2.
    .sort((a, b) => a.number - b.number);

  if (slides.length === 0) {
    throw new Error("No slides found — is this a valid .pptx?");
  }

  const blocks: Block[] = [];
  for (const slide of slides) {
    const xml = await zip.files[slide.path].async("string");
    blocks.push({ locator: `Slide ${slide.number}`, text: slideText(xml) });
  }

  return blocksToChunks(blocks);
}
