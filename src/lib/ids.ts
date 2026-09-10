/** UUID v4 with a non-crypto fallback so the prototype runs in any browser. */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I, O, 0, 1 — read aloud at a ticket window

export function shortCode(length = 6): string {
  let out = ''
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return out
}

/** DMV-4K7Q2X — spoken over a counter, typed into a scanner fallback. */
export function bookingReference(): string {
  return `DMV-${shortCode(3)}${shortCode(3)}`
}

export function ticketCode(): string {
  return `TKT-${shortCode(4)}-${shortCode(4)}`
}

/**
 * Opaque ticket token. Carries no passenger data — the boarding endpoint
 * resolves it server-side against the tickets table.
 */
export function qrToken(): string {
  return `dmv_t_${shortCode(10).toLowerCase()}${Date.now().toString(36)}`
}

export function idempotencyKey(prefix: string): string {
  return `${prefix}_${uuid()}`
}

export function incidentReference(sequence: number): string {
  return `INC-${String(sequence).padStart(5, '0')}`
}

export function tripCode(routeCode: string, serviceDate: string, index: number): string {
  return `${routeCode}-${serviceDate.replace(/-/g, '').slice(4)}-${String(index).padStart(2, '0')}`
}
