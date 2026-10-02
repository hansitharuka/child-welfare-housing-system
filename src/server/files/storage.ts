import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The private folder for uploads, outside the web root (ARC-5). Production sets FILES_DIR to
 * /data/files, a Docker volume; development uses data/files in the project, which git ignores.
 */
export function filesRoot(): string {
  return process.env.FILES_DIR ?? join(process.cwd(), "data", "files");
}

const STORED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Files sit in 256 sub-folders named after the first two characters of their random name. */
function pathOf(storedName: string): string {
  // Stored names are random UUIDs made by us; anything else would point outside the folder.
  if (!STORED_NAME.test(storedName)) throw new Error("Not a stored file name");
  return join(filesRoot(), storedName.slice(0, 2), storedName);
}

/** Writes a new file. It refuses to overwrite one, and only the app's own user may read it. */
export async function writeStoredFile(storedName: string, bytes: Uint8Array): Promise<void> {
  const path = pathOf(storedName);
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
}

export async function readStoredFile(storedName: string): Promise<Buffer> {
  return readFile(pathOf(storedName));
}

/** Removes a file; one that is already gone is fine. */
export async function deleteStoredFile(storedName: string): Promise<void> {
  await rm(pathOf(storedName), { force: true });
}
