import type { DamovDatabase } from '@/db/schema'
import { store } from '@/db/store'
import { uuid } from '@/lib/ids'
import type { Notification, UUID } from '@/lib/types'

export interface NotificationInput {
  recipient_id: UUID
  booking_id?: UUID | null
  trip_id?: UUID | null
  channel: Notification['channel']
  template: Notification['template']
  title: string
  body: string
  payload?: Record<string, unknown>
}

/**
 * Provider abstraction for outbound messaging.
 *
 * In this build every channel resolves to the in-app inbox and is marked `sent`.
 * Wiring a real SMS/WhatsApp provider means implementing `deliver` against the
 * provider SDK in an Edge Function — the notification row, its status timeline
 * and every caller stay as they are.
 */
export function queueNotification(draft: DamovDatabase, input: NotificationInput): Notification {
  const now = new Date().toISOString()
  const notification: Notification = {
    id: uuid(),
    recipient_id: input.recipient_id,
    booking_id: input.booking_id ?? null,
    trip_id: input.trip_id ?? null,
    channel: input.channel,
    template: input.template,
    title: input.title,
    body: input.body,
    payload: input.payload ?? {},
    status: input.channel === 'in_app' ? 'delivered' : 'sent',
    sent_at: now,
    read_at: null,
    created_at: now,
  }
  draft.notifications = [notification, ...draft.notifications]
  return notification
}

export function markNotificationRead(id: UUID) {
  store.transact((draft) => {
    draft.notifications = draft.notifications.map((n) =>
      n.id === id ? { ...n, status: 'read', read_at: new Date().toISOString() } : n,
    )
  })
}

export function markAllNotificationsRead(recipientId: UUID) {
  store.transact((draft) => {
    const now = new Date().toISOString()
    draft.notifications = draft.notifications.map((n) =>
      n.recipient_id === recipientId && n.status !== 'read' ? { ...n, status: 'read', read_at: now } : n,
    )
  })
}
