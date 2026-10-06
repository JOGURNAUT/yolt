import sharp, { type Metadata } from "sharp";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

export class InvalidImageError extends Error {}

/**
 * Normalises a seller photo: applies EXIF rotation, then re-encodes to WebP **without
 * metadata**. Phone photos often carry GPS coordinates — sellers shoot at home, so
 * keeping EXIF would publish their address.
 */
export async function processPhoto(input: Uint8Array) {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new InvalidImageError("Photo is larger than 8 MB.");

  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new InvalidImageError("That file isn't a readable image.");
  }
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
    throw new InvalidImageError("Upload a JPEG, PNG or WebP photo.");
  }
  if ((meta.width ?? 0) < 400 || (meta.height ?? 0) < 400) {
    throw new InvalidImageError("Photo is too small — use at least 400 × 400 pixels so buyers can see details.");
  }

  const { data, info } = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate() // honour EXIF orientation before it is stripped
    .resize({ width: 1600, height: 2000, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  return { data: new Uint8Array(data), width: info.width, height: info.height, contentType: "image/webp" as const };
}

const STORE_IMAGE = {
  /** Square, shown small next to the store name. */
  logo: { width: 512, height: 512, minWidth: 200, minHeight: 200 },
  /** Wide header image; cropped to 8:3 so every store's page header lines up. */
  banner: { width: 1600, height: 600, minWidth: 800, minHeight: 300 },
} as const;
export type StoreImageKind = keyof typeof STORE_IMAGE;

/** Store logo or banner: same safety as `processPhoto` (EXIF stripped, WebP), but cropped to the slot's shape. */
export async function processStoreImage(input: Uint8Array, kind: StoreImageKind) {
  const spec = STORE_IMAGE[kind];
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new InvalidImageError("Image is larger than 8 MB.");

  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new InvalidImageError("That file isn't a readable image.");
  }
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) throw new InvalidImageError("Upload a JPEG, PNG or WebP image.");
  if ((meta.width ?? 0) < spec.minWidth || (meta.height ?? 0) < spec.minHeight) {
    throw new InvalidImageError(`Image is too small. Use at least ${spec.minWidth} × ${spec.minHeight} pixels.`);
  }

  const { data, info } = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: spec.width, height: spec.height, fit: "cover", withoutEnlargement: false })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height, contentType: "image/webp" as const };
}
