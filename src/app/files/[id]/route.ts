import { sendFile } from "../send-file";

/** SEC-7: an uploaded document or photo, under the same permission as its case. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return sendFile(id, "file");
}
