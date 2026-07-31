import { PDFParse } from "pdf-parse";
import { blocksToChunks } from "./chunk";
import type { ParsedChunk } from "@/lib/types";

/**
 * pdf-parse v2 returns text per page, which gives real "Page 2" locators
 * rather than a guess from character offsets.
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedChunk[]> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const result = await parser.getText();
    if (!result.pages?.length) throw new Error("No pages found in the PDF.");

    return blocksToChunks(
      result.pages.map((page) => ({
        locator: `Page ${page.num}`,
        text: page.text,
      })),
    );
  } finally {
    await parser.destroy();
  }
}
