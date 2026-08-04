import "server-only";
import path from "node:path";
import { del, put } from "@vercel/blob";
import { createFile, insertChunks, setFileBlobUrl, setFileStatus } from "@/lib/db/queries";
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

/**
 * Uploaded bytes go to Vercel Blob rather than local disk — a Vercel
 * serverless function's filesystem doesn't persist across requests or
 * deploys. The write is for durability (a later Canvas re-sync, manual
 * re-download) rather than for this request: parsing below reads the bytes
 * already in memory instead of reading them back.
 *
 * Without BLOB_READ_WRITE_TOKEN (local dev with no Blob store linked, or the
 * test suite) this is skipped rather than thrown: the same "manual upload is
 * the fastest way to test" story the database's local file: mode gives you.
 * The lesson still parses and answers questions; it just has no durable copy
 * of its source bytes until a Blob store is configured.
 */
async function storeBytes(fileId: string, filename: string, bytes: Buffer): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;

  const { url } = await put(`uploads/${fileId}${path.extname(filename)}`, bytes, {
    access: "public",
    addRandomSuffix: false,
  });
  await setFileBlobUrl(fileId, url);
}

async function stageBytes(
  lessonId: string,
  filename: string,
  kind: DocumentKind,
  bytes: Buffer,
  canvas?: { fileId: string; updatedAt: string | null },
): Promise<Pending> {
  const fileId = await createFile(lessonId, filename, kind, canvas);
  await storeBytes(fileId, filename, bytes);

  return {
    fileId,
    parse: async () => parseFile(bytes, kind),
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
export async function stageCanvasFile(opts: {
  lessonId: string;
  filename: string;
  kind: DocumentKind;
  canvasFileId: string;
  canvasUpdatedAt: string | null;
  download: () => Promise<Buffer>;
}): Promise<Pending> {
  const fileId = await createFile(opts.lessonId, opts.filename, opts.kind, {
    fileId: opts.canvasFileId,
    updatedAt: opts.canvasUpdatedAt,
  });

  return {
    fileId,
    parse: async () => {
      const bytes = await opts.download();
      // Kept in Blob like an upload, so re-parsing never needs Canvas again.
      await storeBytes(fileId, opts.filename, bytes);
      return parseFile(bytes, opts.kind);
    },
  };
}

/**
 * Canvas rich text — a syllabus body, an assignment description, a module
 * outline. There's no file behind it, so it gets a file row with kind 'html'
 * and nothing in Blob; `label` is what its citations will say.
 */
export async function stageCanvasText(opts: {
  lessonId: string;
  filename: string;
  label: string;
  html: string;
  canvasFileId: string;
  canvasUpdatedAt: string | null;
}): Promise<Pending> {
  const fileId = await createFile(opts.lessonId, opts.filename, "html", {
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
      await insertChunks(lessonId, fileId, chunks);
      await setFileStatus(fileId, "ready", { chunkCount: chunks.length });
    } catch (error) {
      // A bad file shouldn't take down the others or the request.
      await setFileStatus(fileId, "failed", {
        error: error instanceof Error ? error.message : "Could not read this file.",
      });
    }
  }
}

/** Deletes a lesson's file bytes from Blob. Silently ignores missing ones. */
export async function deleteBlobs(urls: string[]): Promise<void> {
  if (urls.length === 0 || !process.env.BLOB_READ_WRITE_TOKEN) return;
  await del(urls);
}
