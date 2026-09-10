export type Result<T> = { ok: true; data: T } | { ok: false; error: string; code: string }

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })
export const fail = <T = never>(code: string, error: string): Result<T> => ({ ok: false, error, code })

/** Thrown inside `store.transact` to roll the whole write back. */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

export function guard<T>(fn: () => T): Result<T> {
  try {
    return ok(fn())
  } catch (err) {
    if (err instanceof DomainError) return fail(err.code, err.message)
    return fail('unexpected_error', err instanceof Error ? err.message : 'Unexpected error')
  }
}
