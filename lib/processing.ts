import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/db";
import { createFile, insertChunks, setFileStatus } from "@/lib/db/queries";
import { kindFromFilename, parseFile } from "@/lib/parsing";
import type { FileKind } from "@/lib/types";

/**
 * Parsing runs in-process rather than through a job queue — at Phase 1 scale a
 * lesson's files take under a second. The file row is created as "processing"
 * before the work starts so the dashboard has something to show either way.
 */

interface Pending {
  fileId: string;
  diskPath: string;
  kind: FileKind;
}

export async function stageUpload(
  lessonId: string,
  file: File,
): Promise<Pending> {
  const kind = kindFromFilename(file.name);
  if (!kind) throw new Error(`${file.name} isn't a PDF, DOCX, or PPTX.`);

  const fileId = createFile(lessonId, file.name, kind);
  const diskPath = path.join(UPLOAD_DIR, `${fileId}${path.extname(file.name)}`);
  await fs.writeFile(diskPath, Buffer.from(await file.arrayBuffer()));

  return { fileId, diskPath, kind };
}

export async function processPending(
  lessonId: string,
  pending: Pending[],
): Promise<void> {
  for (const { fileId, diskPath, kind } of pending) {
    try {
      const chunks = await parseFile(await fs.readFile(diskPath), kind);
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
