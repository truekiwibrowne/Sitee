// Shrinks camera photos to ~300 KB JPEGs before they're stored or uploaded, so they
// fit on cheap phones and upload over weak signal. Drawing to a canvas also strips
// the original EXIF data; GPS and time are kept separately on the submission.

const TARGET_BYTES = 300 * 1024;
const MAX_EDGE = 1600;

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode photo'))), 'image/jpeg', quality),
  );
}

/** A JPEG of the photo no larger than ~300 KB. */
export async function compressPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

  try {
    // Lower the quality first, then the size, until it fits.
    for (;;) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.72, 0.62, 0.52]) {
        const blob = await toBlob(canvas, quality);
        if (blob.size <= TARGET_BYTES || canvas.width < 400) return blob;
      }
      scale *= 0.8;
    }
  } finally {
    bitmap.close();
  }
}

/** Hex SHA-256 of the original photo, for the server's duplicate-photo check. */
export async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
