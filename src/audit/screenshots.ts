const DB_NAME = 'truenorth-audit-hub'
const STORE = 'screenshots'

export type StoredScreenshot = {
  pageId: string
  blob: Blob
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'pageId' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        dbPromise = null
        reject(req.error)
      }
    })
  }
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req.result as T)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

export async function getScreenshot(pageId: string): Promise<Blob | null> {
  const row = await run<StoredScreenshot | undefined>('readonly', (s) => s.get(pageId))
  return row?.blob ?? null
}

export function putScreenshot(pageId: string, blob: Blob): Promise<void> {
  return run('readwrite', (s) => s.put({ pageId, blob } satisfies StoredScreenshot))
}

export function deleteScreenshot(pageId: string): Promise<void> {
  return run('readwrite', (s) => s.delete(pageId))
}

export function readImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file could not be read as an image.'))
    }
    img.src = url
  })
}
