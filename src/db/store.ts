import { useCallback, useRef, useSyncExternalStore } from 'react'
import { EMPTY_DB, type DamovDatabase, type TableName } from './schema'
import { clearPersisted, loadPersisted, savePersisted } from './persistence'

const SCHEMA_VERSION = 1

type Listener = () => void

/**
 * A synchronous, transactional in-browser data layer.
 *
 * Writes go through `transact`, which hands the mutator a draft of the whole
 * database and commits only if the mutator returns without throwing. That gives
 * the prototype the same all-or-nothing guarantee the production booking path
 * needs from Postgres, so the capacity engine can be written once and moved to a
 * Supabase RPC unchanged.
 */
class DamovStore {
  private state: DamovDatabase = EMPTY_DB
  private listeners = new Set<Listener>()
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private hydrating: Promise<void> | null = null

  /** Loads the persisted dataset, seeding a fresh one on first run. */
  hydrate(seed: () => DamovDatabase): Promise<void> {
    if (this.hydrating) return this.hydrating
    this.hydrating = (async () => {
      const persisted = await loadPersisted<DamovDatabase>(SCHEMA_VERSION)
      // A dataset seeded on an earlier service day describes trips that have all
      // finished — reseed so the demo always opens on a live operating day.
      const stale = persisted ? isStale(persisted) : true
      this.state = persisted && !stale ? persisted : seed()
      if (!persisted || stale) void savePersisted(SCHEMA_VERSION, this.state)
      this.emit()
    })()
    return this.hydrating
  }

  async reset(seed: () => DamovDatabase) {
    await clearPersisted(SCHEMA_VERSION)
    this.state = seed()
    void savePersisted(SCHEMA_VERSION, this.state)
    this.emit()
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.state

  read(): DamovDatabase {
    return this.state
  }

  /**
   * Applies `mutator` to a shallow draft. Any throw rolls the whole change back,
   * which is how a failed booking leaves segment inventory untouched.
   */
  transact<T>(mutator: (draft: DamovDatabase) => T): T {
    const draft: DamovDatabase = { ...this.state }
    for (const key of Object.keys(draft) as TableName[]) {
      draft[key] = [...draft[key]] as never
    }
    const result = mutator(draft)
    this.state = draft
    this.schedulePersist()
    this.emit()
    return result
  }

  private schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => void savePersisted(SCHEMA_VERSION, this.state), 400)
  }

  private emit() {
    for (const listener of this.listeners) listener()
  }
}

function isStale(db: DamovDatabase) {
  const today = new Date().toISOString().slice(0, 10)
  const latest = db.trips.reduce((max, trip) => (trip.service_date > max ? trip.service_date : max), '')
  return latest < today
}

export const store = new DamovStore()

/**
 * Subscribes a component to a derived slice of the database.
 *
 * `useSyncExternalStore` needs `getSnapshot` to hand back the same reference
 * until the store actually changes; a selector that filters or maps would
 * otherwise produce a new array every call and React would loop forever. The
 * result is cached per (snapshot, selector) pair, so a selector wrapped in
 * `useCallback` recomputes only when the database or its inputs change.
 */
export function useDb<T>(selector: (db: DamovDatabase) => T): T {
  const cache = useRef<{ snapshot: DamovDatabase; selector: (db: DamovDatabase) => T; value: T } | null>(null)
  const select = useCallback(() => {
    const snapshot = store.getSnapshot()
    const hit = cache.current
    if (hit && hit.snapshot === snapshot && hit.selector === selector) return hit.value
    const value = selector(snapshot)
    cache.current = { snapshot, selector, value }
    return value
  }, [selector])
  return useSyncExternalStore(store.subscribe, select, select)
}

/** Subscribes to a whole table. Prefer `useDb` with a narrow selector in hot views. */
export function useTable<T extends TableName>(name: T): DamovDatabase[T] {
  const select = useCallback(() => store.getSnapshot()[name], [name])
  return useSyncExternalStore(store.subscribe, select, select)
}

export type { DamovDatabase }
