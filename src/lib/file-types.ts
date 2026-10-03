/**
 * What may be uploaded, checked from a file's first bytes rather than its name (SEC-7). The same check
 * runs in the browser, so a wrong file is refused before it is sent (ERR-5), and again on the server.
 */
export type SniffedType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

/** "Other documents" on a case (CASE-2): PDF, JPEG or PNG, up to 10 MB each, at most 10 per case. */
export const DOCUMENT_TYPES: readonly SniffedType[] = ["application/pdf", "image/jpeg", "image/png"];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENTS = 10;

/** For the file picker only. The real check is sniffType(). */
export const DOCUMENT_ACCEPT = "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

/** Photos of building progress (STG-1): JPEG, PNG or WebP, up to 15 MB each, at most 10 per update. */
export const PHOTO_TYPES: readonly SniffedType[] = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_PHOTOS = 10;

/** For the file picker only. The real check is sniffType(). */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

/** How many bytes sniffType() needs. */
export const SNIFF_BYTES = 16;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((value, index) => bytes[offset + index] === value);

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** The file's real type from its first bytes, or null when it is none of the accepted types. */
export function sniffType(head: Uint8Array): SniffedType | null {
  if (startsWith(head, ascii("%PDF-"))) return "application/pdf";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8)) return "image/webp";
  return null;
}

export type FileProblem = "fileEmpty" | "fileTooBig" | "fileType";

function problem(size: number, head: Uint8Array, maxBytes: number, types: readonly SniffedType[]): FileProblem | null {
  if (size === 0) return "fileEmpty";
  if (size > maxBytes) return "fileTooBig";
  const type = sniffType(head);
  return type && types.includes(type) ? null : "fileType";
}

/** Why a document can't be accepted, or null when it can (CASE-2, ERR-5). */
export function documentProblem(size: number, head: Uint8Array): FileProblem | null {
  return problem(size, head, MAX_DOCUMENT_BYTES, DOCUMENT_TYPES);
}

/** Why a photo can't be accepted, or null when it can (STG-1, ERR-5). */
export function photoProblem(size: number, head: Uint8Array): FileProblem | null {
  return problem(size, head, MAX_PHOTO_BYTES, PHOTO_TYPES);
}
