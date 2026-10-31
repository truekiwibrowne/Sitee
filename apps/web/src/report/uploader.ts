import { useEffect, useState } from 'react';
import { getMetadata, ref, uploadBytes } from 'firebase/storage';
import { photoPath } from '@site-streak/shared';
import { storage } from '../lib/firebase';
import { deletePhoto, getPhoto, putPhoto, queuedCount, queuedPhotos, type StoredPhoto } from './photoStore';

// Uploads queued photos whenever there's signal: on launch, when the phone comes back
// online, after each report is sent, and every minute as a backstop.

const changes = new EventTarget();
let running = false;

async function uploadOne(p: StoredPhoto) {
  const target = ref(storage, photoPath(p.orgId, p.siteId, p.taskId, p.id));
  try {
    await uploadBytes(target, p.blob, {
      contentType: 'image/jpeg',
      customMetadata: { sha256: p.sha256, capturedAt: String(p.capturedAt) },
    });
  } catch (err) {
    // Photos can't be overwritten, so a retry after an upload that did land is refused.
    // If the file is there, that's success.
    const exists = await getMetadata(target).then(
      () => true,
      () => false,
    );
    if (!exists) throw err;
  }
  // Keep the details (not the image) until the report is confirmed; see photoStore.
  // Re-read first: the report may have been confirmed while this photo was uploading.
  const latest = (await getPhoto(p.id)) ?? p;
  if (latest.confirmed) await deletePhoto(p.id);
  else await putPhoto({ ...latest, blob: new Blob([]), status: 'uploaded' });
}

/** Tries every queued photo once. Safe to call often; overlapping calls are ignored. */
export async function flushPhotoQueue() {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    for (const p of await queuedPhotos()) {
      try {
        await uploadOne(p);
      } catch (err) {
        console.warn('Photo upload failed, will retry', p.id, err);
      }
      changes.dispatchEvent(new Event('change'));
    }
  } finally {
    running = false;
    changes.dispatchEvent(new Event('change'));
  }
}

/** Tells the uploader the queue grew (a report was just sent). */
export function photosQueued() {
  changes.dispatchEvent(new Event('change'));
  void flushPhotoQueue();
}

/** Keeps the uploader running while the app is open. */
export function usePhotoUploader() {
  useEffect(() => {
    void flushPhotoQueue();
    const onOnline = () => void flushPhotoQueue();
    window.addEventListener('online', onOnline);
    const timer = setInterval(() => void flushPhotoQueue(), 60_000);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, []);
}

/** How many photos are still waiting to upload. */
export function usePendingPhotoCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => void queuedCount().then((n) => alive && setCount(n));
    refresh();
    changes.addEventListener('change', refresh);
    return () => {
      alive = false;
      changes.removeEventListener('change', refresh);
    };
  }, []);
  return count;
}
