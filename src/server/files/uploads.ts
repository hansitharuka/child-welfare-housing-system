import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { documentProblem, type FileProblem, SNIFF_BYTES, sniffType } from "@/lib/file-types";
import { logError } from "../log";
import { canSeeOffice, caseScope, type Viewer } from "../permissions";
import { deleteStoredFile, writeStoredFile } from "./storage";

type Actor = Viewer & { userId: string };

export type UploadedFile = { id: string; name: string };
export type UploadError = FileProblem | "notAllowed";

/** An upload that was never saved with a case is removed after a day. */
const UNUSED_UPLOAD_MS = 24 * 60 * 60 * 1000;

/** The name to show for an uploaded file: no folders, no control characters, at most 200 characters. */
export function cleanFileName(raw: string): string {
  const name = (raw.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 200);
  return name || "file";
}

/**
 * Stores one uploaded document (CASE-2, SEC-7): its type comes from its contents, it gets a random name
 * in the private folder, and it belongs to the person who uploaded it until a case is saved with it.
 * Each file is checked on its own, so one bad file doesn't stop the others (ERR-5).
 */
export async function uploadDocument(
  db: PrismaClient,
  actor: Actor,
  file: { name: string; bytes: Uint8Array },
): Promise<{ ok: true; value: UploadedFile } | { ok: false; error: UploadError }> {
  if (caseScope(actor).kind === "none") return { ok: false, error: "notAllowed" };
  const problem = documentProblem(file.bytes.length, file.bytes.subarray(0, SNIFF_BYTES));
  if (problem) return { ok: false, error: problem };

  await removeUnusedUploads(db, actor.userId);

  const id = randomUUID();
  const storedName = randomUUID();
  const name = cleanFileName(file.name);
  await writeStoredFile(storedName, file.bytes);
  try {
    await db.storedFile.create({
      data: {
        id,
        storedName,
        originalName: name,
        mimeType: sniffType(file.bytes.subarray(0, SNIFF_BYTES)) as string,
        size: file.bytes.length,
        sha256: createHash("sha256").update(file.bytes).digest("hex"),
        uploadedById: actor.userId,
      },
    });
  } catch (error) {
    await deleteStoredFile(storedName);
    throw error;
  }
  return { ok: true, value: { id, name } };
}

/** Removes the person's uploads that were never saved with a case, once they are a day old. */
async function removeUnusedUploads(db: PrismaClient, userId: string): Promise<void> {
  const where = { uploadedById: userId, caseId: null, uploadedAt: { lt: new Date(Date.now() - UNUSED_UPLOAD_MS) } };
  const unused = await db.storedFile.findMany({ where, select: { id: true, storedName: true } });
  if (unused.length === 0) return;
  await db.storedFile.deleteMany({ where: { id: { in: unused.map((f) => f.id) }, caseId: null } });
  for (const file of unused) {
    await deleteStoredFile(file.storedName).catch((error: unknown) =>
      logError("file_delete_failed", error, { fileId: file.id }),
    );
  }
}

export type FileToSend = { storedName: string; originalName: string; mimeType: string; size: number };

/**
 * A file the viewer may open (SEC-7): a case's file under the same office rules as the case itself
 * (PRM-1), or the viewer's own upload that is not on a case yet. Anything else is "not found".
 */
export async function fileForViewer(db: PrismaClient, viewer: Actor, id: string): Promise<FileToSend | null> {
  if (caseScope(viewer).kind === "none") return null;
  const file = await db.storedFile.findUnique({
    where: { id },
    select: {
      storedName: true,
      originalName: true,
      mimeType: true,
      size: true,
      uploadedById: true,
      removedAt: true,
      case: { select: { dsOfficeId: true } },
    },
  });
  if (!file || file.removedAt) return null;
  const allowed = file.case ? canSeeOffice(viewer, file.case.dsOfficeId) : file.uploadedById === viewer.userId;
  if (!allowed) return null;
  return { storedName: file.storedName, originalName: file.originalName, mimeType: file.mimeType, size: file.size };
}
