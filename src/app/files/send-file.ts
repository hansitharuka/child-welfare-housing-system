import { notFound } from "next/navigation";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { fileForViewer } from "@/server/files/uploads";
import { readStoredFile } from "@/server/files/storage";

/**
 * SEC-7: an uploaded file, or a photo's thumbnail, opened in the browser. It needs the same right as
 * the case it belongs to (PRM-1); anything else answers "not found", the same as a file that doesn't
 * exist (ERR-2).
 */
export async function sendFile(id: string, variant: "file" | "thumb"): Promise<Response> {
  const context = await getContext();
  if (!context || context.mustChangePassword) notFound();

  const file = await fileForViewer(db, context, id, variant);
  if (!file) notFound();

  const bytes = await readStoredFile(file.storedName);
  // The name may hold Sinhala letters: an ASCII stand-in, plus the real name in UTF-8 (RFC 6266).
  const disposition = `inline; filename="file"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
