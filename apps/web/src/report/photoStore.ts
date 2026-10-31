import type { Gps } from '@site-streak/shared';

// Photos live on the phone in IndexedDB from the moment they're taken until they've
// uploaded. Firestore queues the report itself offline, but Storage uploads don't
// queue, so this store is the photo queue. Plain IndexedDB, no library.

export type StoredPhoto = {
  id: string;
  orgId: string;
  siteId: string;
  taskId: string;
  fieldId: string;
  blob: Blob;
  bytes: number;
  sha256: string;
  capturedAt: number;
  gps: Gps | null;
  /**
   * draft: in an unsent form. queued: report sent, waiting to upload.
   * uploaded: in Storage; only the details are kept (blob dropped) until the report is
   * confirmed on the server, so a rejected report can be re-sent with its photos.
   */
  status: 'draft' | 'queued' | 'uploaded';
  /** The report is on the server, so once this photo uploads it can be deleted outright. */
  confirmed?: boolean;
};

const DB_NAME = 'site-streak';
const STORE = 'photos';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('status', 'status');
      store.createIndex('taskId', 'taskId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const putPhoto = (photo: StoredPhoto) => run('readwrite', (s) => s.put(photo)).then(() => undefined);
export const getPhoto = (id: string) => run<StoredPhoto | undefined>('readonly', (s) => s.get(id));
export const deletePhoto = (id: string) => run('readwrite', (s) => s.delete(id)).then(() => undefined);
export const photosForTask = (taskId: string) =>
  run<StoredPhoto[]>('readonly', (s) => s.index('taskId').getAll(taskId));
export const queuedPhotos = () => run<StoredPhoto[]>('readonly', (s) => s.index('status').getAll('queued'));
export const queuedCount = () => run<number>('readonly', (s) => s.index('status').count('queued'));

/** Called on submit: the task's draft photos join the upload queue. */
export async function queueTaskPhotos(taskId: string, keepIds: string[]) {
  for (const p of await photosForTask(taskId)) {
    if (!keepIds.includes(p.id)) await deletePhoto(p.id); // Taken, then removed from the form.
    else if (p.status === 'draft') await putPhoto({ ...p, status: 'queued' });
  }
}

/** Once a report is confirmed on the server, its photo records are no longer needed. */
export async function forgetTaskPhotos(taskId: string) {
  for (const p of await photosForTask(taskId)) {
    if (p.status === 'uploaded') await deletePhoto(p.id);
    // Still uploading: let the uploader delete it when it's done.
    else if (p.status === 'queued' && !p.confirmed) await putPhoto({ ...p, confirmed: true });
  }
}
