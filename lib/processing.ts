import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/db";
import { createFile, insertChunks, setFileStatus } from "@/lib/db/queries";
import { kindFromFilename, parseFile, type DocumentKind } from "@/lib/parsing";
import { parseHtml } from "@/lib/parsing/html";
import type { ParsedChunk } from "@/lib/types";

/**
 * Parsing runs in-process rather than through a job queue — at Phase 1 scale a
 * lesson's files take under a second. The file row is created as "processing"
 * before the work starts so the dashboard has something to show either way.
 *
 * Phase 2 routes Canvas content through here too. Whatever the source, a
 * `Pending` is a file row plus a way to get chunks out of it, and everything
 * downstream — chunks, citations, retrieval — sees one shape.
 */

export interface Pending {
  fileId: string;
  parse: () => Promise<ParsedChunk[]>;
}

/** Where a file's bytes live once staged. Kept alongside its row's id. */
export function uploadPath(fileId: string, filename: string): string {
  return path.join(UPLOAD_DIR, `${fileId}${path.extname(filename)}`);
}

async function stageBytes(
  lessonId: string,
  filename: string,
  kind: DocumentKind,
  bytes: Buffer,
  canvas?: { fileId: string; updatedAt: string | null },
): Promise<Pending> {
  const fileId = createFile(lessonId, filename, kind, canvas);
  const diskPath = uploadPath(fileId, filename);
  await fs.writeFile(diskPath, bytes);

  return {
    fileId,
    parse: async () => parseFile(await fs.readFile(diskPath), kind),
  };
}

export async function stageUpload(lessonId: string, file: File): Promise<Pending> {
  const kind = kindFromFilename(file.name);
  if (!kind) throw new Error(`${file.name} isn't a PDF, DOCX, or PPTX.`);

  return stageBytes(
    lessonId,
    file.name,
    kind,
    Buffer.from(await file.arrayBuffer()),
  );
}

/**
 * A file to pull from Canvas. The download is deliberately deferred into
 * `parse()` rather than done here, so a sync of a course with a dozen decks
 * returns immediately and the dashboard shows the same Processing → Ready
 * badges as a manual upload. A download that fails lands as a failed file with
 * a readable reason instead of failing the whole sync.
 */
export function stageCanvasFile(opts: {
  lessonId: string;
  filename: string;
  kind: DocumentKind;
  canvasFileId: string;
  canvasUpdatedAt: string | null;
  download: () => Promise<Buffer>;
}): Pending {
  const fileId = createFile(opts.lessonId, opts.filename, opts.kind, {
    fileId: opts.canvasFileId,
    updatedAt: opts.canvasUpdatedAt,
  });

  return {
    fileId,
    parse: async () => {
      const bytes = await opts.download();
      // Kept on disk like an upload, so re-parsing never needs Canvas again.
      await fs.writeFile(uploadPath(fileId, opts.filename), bytes);
      return parseFile(bytes, opts.kind);
    },
  };
}

/**
 * Canvas rich text — a syllabus body, an assignment description, a module
 * outline. There's no file behind it, so it gets a file row with kind 'html'
 * and nothing on disk; `label` is what its citations will say.
 */
export function stageCanvasText(opts: {
  lessonId: string;
  filename: string;
  label: string;
  html: string;
  canvasFileId: string;
  canvasUpdatedAt: string | null;
}): Pending {
  const fileId = createFile(opts.lessonId, opts.filename, "html", {
    fileId: opts.canvasFileId,
    updatedAt: opts.canvasUpdatedAt,
  });

  return { fileId, parse: async () => parseHtml(opts.html, opts.label) };
}

export async function processPending(
  lessonId: string,
  pending: Pending[],
): Promise<void> {
  for (const { fileId, parse } of pending) {
    try {
      const chunks = await parse();
      insertChunks(lessonId, fileId, chunks);
      setFileStatus(fileId, "ready", { chunkCount: chunks.length });
    } catch (error) {
      // A bad file shouldn't take down the others or the request.
      setFileStatus(fileId, "failed", {
        error: error instanceof Error ? error.message : "Could not read this file.",
      });
    }
  }
}
