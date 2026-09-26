/**
 * Shrinks a phone photo before upload so it survives weak connections and stays well under
 * the server's limit. The server re-encodes and strips metadata anyway; this is about bytes.
 * Browsers that can't decode a format (e.g. HEIC outside Safari) upload the original, and
 * the server explains if it can't read it.
 */
export async function shrinkForUpload(file: File, maxEdge = 2400): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 2_000_000 && file.type === "image/jpeg") return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.88));
}
