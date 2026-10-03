import { sendFile } from "../../send-file";

/** STG-6: a photo's thumbnail, under the same permission as its case (SEC-7). A document has none. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return sendFile(id, "thumb");
}
