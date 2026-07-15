/**
 * Browser-side thumbnail generation — runs at upload time so cards have a
 * small image immediately (the weekly thumbnails workflow is the backstop
 * for legacy photos). ~400px wide JPEG, mirroring scripts/generate_thumbnails.py.
 * Client-only (uses canvas); returns null on any failure — thumbnails are an
 * optimization, never a reason to fail an upload.
 */
export async function makeThumbnail(file: File, width = 400): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, width / bmp.width)
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bmp, 0, 0, w, h)
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
  } catch {
    return null
  }
}
