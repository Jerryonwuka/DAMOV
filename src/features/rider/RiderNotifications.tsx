import { useCallback } from 'react'
import { motion } from 'framer-motion'
import { Bell, CheckCheck, MessageSquare, Smartphone } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, PageHeader } from '@/components/ui/patterns'
import { relative } from '@/lib/format'
import { markAllNotificationsRead, markNotificationRead } from '@/server/notifications'
import { cn, titleCase } from '@/lib/utils'

const CHANNEL_ICON = { in_app: Bell, sms: Smartphone, whatsapp: MessageSquare, email: MessageSquare, push: Bell }

export function RiderNotifications() {
  const { profile } = useAuth()
  const notifications = useDb(
    useCallback(
      (db) =>
        db.notifications
          .filter((n) => n.recipient_id === profile?.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      [profile?.id],
    ),
  )
  const unread = notifications.filter((n) => n.status !== 'read').length

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notifications"
        description="Booking, payment, departure and disruption updates."
        actions={
          unread > 0 && (
            <Button variant="outline" size="sm" onClick={() => profile && markAllNotificationsRead(profile.id)}>
              <CheckCheck className="size-4" /> Mark all read
            </Button>
          )
        }
      />

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="Nothing yet" description="Updates about your journeys will land here." />
      ) : (
        <div className="space-y-2">
          {notifications.map((notification, index) => {
            const Icon = CHANNEL_ICON[notification.channel]
            const isUnread = notification.status !== 'read'
            return (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.25) }}
              >
                <Card
                  interactive
                  onClick={() => markNotificationRead(notification.id)}
                  className={cn('flex gap-3 p-4', isUnread && 'border-primary/30 bg-primary/[0.04]')}
                >
                  <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', isUnread ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn('text-sm', isUnread ? 'font-semibold' : 'font-medium')}>{notification.title}</p>
                      <span className="shrink-0 text-2xs text-muted-foreground">{relative(notification.created_at)}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{notification.body}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge tone="neutral" size="sm">{notification.channel.replace('_', '-')}</Badge>
                      <span className="text-2xs text-muted-foreground">{titleCase(notification.status)}</span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
