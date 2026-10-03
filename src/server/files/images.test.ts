import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PHOTO_EDGE, processPhoto, THUMB_EDGE } from "./images";

const MAKER = "TestPhoneMaker";
/** The EXIF tag that points at the GPS block (0x8825), as a little-endian EXIF block stores it. */
const GPS_POINTER = Buffer.from([0x25, 0x88]);

/** A made-up phone photo: landscape pixels, a "turn 90°" orientation, the phone's name and a GPS position. */
function phonePhoto(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: MAKER },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "6/1 54/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "79/1 51/1 0/1" },
    })
    .toBuffer();
}

describe("processPhoto (STG-3, AC-16)", () => {
  it("removes all metadata, the GPS position included", async () => {
    const input = await phonePhoto(1200, 800);
    const before = await sharp(input).metadata();
    expect(before.exif?.includes(GPS_POINTER)).toBe(true);
    expect(before.exif?.includes(Buffer.from(MAKER))).toBe(true);

    const result = await processPhoto(input);
    expect(result).not.toBeNull();
    for (const stored of [result!.photo, result!.thumb]) {
      const after = await sharp(stored).metadata();
      expect(after.format).toBe("jpeg");
      expect(after.exif).toBeUndefined();
      expect(after.xmp).toBeUndefined();
      expect(after.iptc).toBeUndefined();
      expect(stored.includes(Buffer.from(MAKER))).toBe(false);
      expect(stored.includes(Buffer.from("Exif"))).toBe(false);
    }
  });

  it("turns the photo upright and makes it at most 1,600 px on its long edge", async () => {
    const result = await processPhoto(await phonePhoto(3000, 2000));
    const photo = await sharp(result!.photo).metadata();
    // The phone held it on its side: 3,000 × 2,000 pixels turned a quarter turn.
    expect([photo.width, photo.height]).toEqual([1067, PHOTO_EDGE]);
    const thumb = await sharp(result!.thumb).metadata();
    expect(Math.max(thumb.width ?? 0, thumb.height ?? 0)).toBe(THUMB_EDGE);
  });

  it("never makes a small photo larger", async () => {
    const small = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#336699" } })
      .png()
      .toBuffer();
    const result = await processPhoto(small);
    const photo = await sharp(result!.photo).metadata();
    expect([photo.format, photo.width, photo.height]).toEqual(["jpeg", 640, 480]);
  });

  it("lays a transparent PNG on white and accepts WebP", async () => {
    const clear = { width: 8, height: 8, channels: 4 as const, background: { r: 0, g: 0, b: 0, alpha: 0 } };
    const png = await sharp({ create: clear }).png().toBuffer();
    const pixels = await sharp((await processPhoto(png))!.photo)
      .raw()
      .toBuffer();
    expect([pixels[0], pixels[1], pixels[2]]).toEqual([255, 255, 255]);

    const webp = await sharp({ create: clear }).webp().toBuffer();
    expect(await processPhoto(webp)).not.toBeNull();
  });

  it("refuses a file that only looks like an image", async () => {
    expect(await processPhoto(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]))).toBeNull();
    expect(await processPhoto(new TextEncoder().encode("RIFF....WEBPVP8 not really"))).toBeNull();
  });
});
