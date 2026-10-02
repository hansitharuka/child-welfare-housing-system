import { describe, expect, it } from "vitest";
import { documentProblem, MAX_DOCUMENT_BYTES, sniffType } from "./file-types";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

const PDF = bytes("%PDF-1.7\n");
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const WEBP = bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 ");

describe("sniffType (SEC-7)", () => {
  it("knows PDF, JPEG, PNG and WebP from their first bytes", () => {
    expect(sniffType(PDF)).toBe("application/pdf");
    expect(sniffType(JPEG)).toBe("image/jpeg");
    expect(sniffType(PNG)).toBe("image/png");
    expect(sniffType(WEBP)).toBe("image/webp");
  });

  it("knows nothing else, whatever the file is called", () => {
    expect(sniffType(bytes("<html><script>"))).toBeNull();
    expect(sniffType(bytes("PK", [3, 4]))).toBeNull(); // a Word or zip file
    expect(sniffType(bytes("GIF89a"))).toBeNull();
    expect(sniffType(new Uint8Array())).toBeNull();
  });
});

describe("documentProblem (CASE-2, ERR-5)", () => {
  it("accepts a PDF, JPEG or PNG up to 10 MB", () => {
    expect(documentProblem(1000, PDF)).toBeNull();
    expect(documentProblem(MAX_DOCUMENT_BYTES, JPEG)).toBeNull();
    expect(documentProblem(5000, PNG)).toBeNull();
  });

  it("refuses an empty file, a larger file, and other types, WebP included", () => {
    expect(documentProblem(0, PDF)).toBe("fileEmpty");
    expect(documentProblem(MAX_DOCUMENT_BYTES + 1, PDF)).toBe("fileTooBig");
    expect(documentProblem(1000, WEBP)).toBe("fileType");
    expect(documentProblem(1000, bytes("hello"))).toBe("fileType");
  });
});
