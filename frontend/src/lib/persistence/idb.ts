// Minimal promise wrapper over IndexedDB. Large media (Blobs) live here — never in localStorage.
const DB_NAME = "athar-kareem";
const DB_VERSION = 1;
export const STORES = ["favorites", "templates", "projects", "media"] as const;
export type StoreName = (typeof STORES)[number];

export class StorageError extends Error {
  quota: boolean;
  constructor(message: string, quota = false) {
    super(message);
    this.name = "StorageError";
    this.quota = quota;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new StorageError("المتصفح لا يدعم التخزين المحلي (IndexedDB)"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("favorites")) db.createObjectStore("favorites", { keyPath: "key" });
        for (const s of ["templates", "projects", "media"]) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(new StorageError("تعذّر فتح التخزين المحلي"));
      };
    });
  }
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>, tx?: IDBTransaction): Promise<T> {
  return new Promise((resolve, reject) => {
    const fail = (err: DOMException | null) => {
      const quota = err?.name === "QuotaExceededError";
      reject(new StorageError(quota ? "مساحة التخزين في المتصفح ممتلئة" : "فشل الحفظ في التخزين المحلي", quota));
    };
    if (tx) {
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = () => fail(tx.error);
      tx.onerror = () => fail(tx.error);
    } else {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => fail(req.error);
    }
  });
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await open();
  return wrap(db.transaction(store, "readonly").objectStore(store).getAll() as IDBRequest<T[]>);
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await open();
  return wrap(db.transaction(store, "readonly").objectStore(store).get(key) as IDBRequest<T | undefined>);
}

export async function idbPut<T>(store: StoreName, value: T): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, "readwrite");
  await wrap(tx.objectStore(store).put(value), tx);
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, "readwrite");
  await wrap(tx.objectStore(store).delete(key), tx);
}

export async function idbClear(store: StoreName): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, "readwrite");
  await wrap(tx.objectStore(store).clear(), tx);
}
