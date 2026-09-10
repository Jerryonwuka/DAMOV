import type { BookingStatus, CashSession, Incident, RouteStatus, TripStatus, VehicleStatus } from '@/lib/types'
import { titleCase } from '@/lib/utils'
import { Badge, type BadgeProps } from './badge'

type Tone = NonNullable<BadgeProps['tone']>

const TRIP_TONE: Record<TripStatus, Tone> = {
  scheduled: 'neutral',
  assigned: 'info',
  boarding: 'warning',
  departed: 'primary',
  in_service: 'primary',
  completed: 'forest',
  cancelled: 'critical',
  held: 'warning',
}

const BOOKING_TONE: Record<BookingStatus, Tone> = {
  pending: 'neutral', held: 'warning', confirmed: 'info', checked_in: 'info', boarded: 'primary',
  completed: 'forest', cancelled: 'critical', expired: 'neutral', no_show: 'warning', refunded: 'critical',
}

const VEHICLE_TONE: Record<VehicleStatus, Tone> = {
  available: 'forest', assigned: 'info', operating: 'primary', charging: 'warning',
  maintenance: 'warning', out_of_service: 'critical',
}

const ROUTE_TONE: Record<RouteStatus, Tone> = {
  reference: 'neutral', draft: 'neutral', pending_approval: 'warning', published: 'primary',
  suspended: 'warning', archived: 'neutral',
}

const CASH_TONE: Record<CashSession['status'], Tone> = {
  open: 'info', submitted: 'warning', under_review: 'warning', approved: 'primary',
  rejected: 'critical', returned: 'critical',
}

const INCIDENT_TONE: Record<Incident['severity'], Tone> = {
  low: 'neutral', medium: 'warning', high: 'critical', critical: 'critical',
}

export function TripStatusBadge({ status }: { status: TripStatus }) {
  const live = status === 'departed' || status === 'in_service'
  return (
    <Badge tone={TRIP_TONE[status]} dot pulse={live}>
      {status === 'in_service' ? 'In service' : titleCase(status)}
    </Badge>
  )
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={BOOKING_TONE[status]}>{titleCase(status)}</Badge>
}

export function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  return (
    <Badge tone={VEHICLE_TONE[status]} dot pulse={status === 'operating'}>
      {titleCase(status)}
    </Badge>
  )
}

export function RouteStatusBadge({ status }: { status: RouteStatus }) {
  return <Badge tone={ROUTE_TONE[status]}>{titleCase(status)}</Badge>
}

export function CashStatusBadge({ status }: { status: CashSession['status'] }) {
  return <Badge tone={CASH_TONE[status]}>{titleCase(status)}</Badge>
}

export function SeverityBadge({ severity }: { severity: Incident['severity'] }) {
  return (
    <Badge tone={INCIDENT_TONE[severity]} dot={severity === 'critical'} pulse={severity === 'critical'}>
      {titleCase(severity)}
    </Badge>
  )
}
