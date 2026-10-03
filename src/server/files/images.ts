import sharp from "sharp";

/** STG-3: a stored photo is at most 1,600 px on its long edge, saved as a JPEG at quality 80. */
export const PHOTO_EDGE = 1600;
export const PHOTO_QUALITY = 80;

/** The small copy shown on the case page (STG-6). */
export const THUMB_EDGE = 320;
const THUMB_QUALITY = 75;

/**
 * Phones take photos of up to about 50 megapixels. Anything much larger is refused before it is
 * decoded, so one upload can't take all of the server's memory.
 */
const MAX_INPUT_PIXELS = 100_000_000;

export type ProcessedPhoto = { photo: Buffer; thumb: Buffer };

/**
 * STG-3: turns an uploaded photo into what is stored. It is turned upright first (phones record the
 * rotation in the metadata), resized to at most 1,600 px on its long edge, laid on white where it is
 * transparent and saved as a JPEG at quality 80. sharp writes no metadata unless asked to, so
 * everything else in the original, the GPS location included, is left behind. A thumbnail is made
 * from the result. Returns null when the file can't be read as an image.
 */
export async function processPhoto(bytes: Uint8Array): Promise<ProcessedPhoto | null> {
  try {
    const photo = await sharp(bytes, { autoOrient: true, limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ width: PHOTO_EDGE, height: PHOTO_EDGE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: PHOTO_QUALITY })
      .toBuffer();
    const thumb = await sharp(photo)
      .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY })
      .toBuffer();
    return { photo, thumb };
  } catch {
    // A damaged or disguised file, or one larger than MAX_INPUT_PIXELS.
    return null;
  }
}
