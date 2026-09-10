/**
 * Durable storage for the prototype dataset.
 *
 * A full pilot service day — 88 trips, ~1,700 bookings and every segment
 * reservation behind them — is several megabytes, well past the localStorage
 * budget, so the database lives in IndexedDB. localStorage remains the fallback
 * for browsers that block it, and an in-memory session is the last resort:
 * losing durability must never stop the app from running.
 */
const DB_NAME = 'damov'
const STORE_NAME = 'state'
const KEY = 'database'

let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

export async function loadPersisted<T>(version: number): Promise<T | null> {
  try {
    const db = await openDatabase()
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(`${KEY}.v${version}`)
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null)
      request.onerror = () => reject(request.error)
    })
  } catch {
    try {
      const raw = localStorage.getItem(`damov.db.v${version}`)
      return raw ? (JSON.parse(raw) as T) : null
    } catch {
      return null
    }
  }
}

export async function savePersisted<T>(version: number, value: T): Promise<void> {
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(value, `${KEY}.v${version}`)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Storage is unavailable or full; the session continues from memory.
  }
}

export async function clearPersisted(maxVersion: number): Promise<void> {
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const objectStore = tx.objectStore(STORE_NAME)
      for (let v = 1; v <= maxVersion; v++) objectStore.delete(`${KEY}.v${v}`)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // Nothing to clear.
  }
  for (let v = 1; v <= maxVersion; v++) {
    try {
      localStorage.removeItem(`damov.db.v${v}`)
    } catch {
      /* ignore */
    }
  }
}
