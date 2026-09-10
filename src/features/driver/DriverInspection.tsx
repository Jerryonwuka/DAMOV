import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, ClipboardCheck, X } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EmptyState, PageHeader } from '@/components/ui/patterns'
import type { VehicleInspectionItem } from '@/lib/types'
import { submitVehicleInspection } from '@/server/trips'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useDriverShift } from './driver-data'

const CHECKLIST: { key: string; label: string; group: string }[] = [
  { key: 'tyres', label: 'Tyres and wheel nuts', group: 'Exterior' },
  { key: 'lights', label: 'Head, tail, brake and indicator lights', group: 'Exterior' },
  { key: 'mirrors', label: 'Mirrors and glass', group: 'Exterior' },
  { key: 'body', label: 'Body damage and doors', group: 'Exterior' },
  { key: 'brakes', label: 'Brake response and parking brake', group: 'Driving' },
  { key: 'steering', label: 'Steering and horn', group: 'Driving' },
  { key: 'dashboard', label: 'Dashboard warnings clear', group: 'Driving' },
  { key: 'energy', label: 'Charge / fuel sufficient for the block', group: 'Driving' },
  { key: 'seats', label: 'Seats, belts and handrails', group: 'Passenger' },
  { key: 'extinguisher', label: 'Fire extinguisher and first-aid kit', group: 'Passenger' },
  { key: 'cleanliness', label: 'Interior clean and free of hazards', group: 'Passenger' },
  { key: 'documents', label: 'Vehicle documents on board', group: 'Passenger' },
]

/**
 * Pre-trip inspection.
 *
 * A trip cannot start without a passed inspection for the assigned vehicle on
 * the service day. Any failed item routes to a supervisor rather than being
 * quietly overridden by the driver.
 */
export function DriverInspection() {
  const navigate = useNavigate()
  const { profile, actor } = useAuth()
  const shift = useDriverShift()
  const [answers, setAnswers] = useState<Record<string, boolean | null>>({})
  const [defects, setDefects] = useState('')
  const [odometer, setOdometer] = useState(String(shift.vehicle?.odometer_km ?? ''))

  if (!shift.vehicle) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Vehicle inspection" />
        <EmptyState icon={ClipboardCheck} title="No vehicle to inspect" description="An inspection is recorded against the vehicle dispatch assigns to you." />
      </div>
    )
  }

  if (shift.inspection) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Vehicle inspection" />
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{shift.vehicle.fleet_number} · today</p>
              <Badge tone={shift.inspection.passed ? 'primary' : 'critical'}>{shift.inspection.passed ? 'Passed' : 'Failed'}</Badge>
            </div>
            <ul className="space-y-1">
              {shift.inspection.checklist.map((item) => (
                <li key={item.key} className="flex items-center gap-2 text-sm">
                  <span className={cn('grid size-5 place-items-center rounded-full', item.passed ? 'bg-primary/15 text-primary' : 'bg-critical/15 text-critical')}>
                    {item.passed ? <Check className="size-3" /> : <X className="size-3" />}
                  </span>
                  {item.label}
                </li>
              ))}
            </ul>
            {shift.inspection.defects && <p className="rounded-lg bg-muted/60 p-3 text-sm">{shift.inspection.defects}</p>}
            {!shift.inspection.passed && (
              <p className="text-xs text-muted-foreground">
                A supervisor must clear or ground this vehicle. The trip cannot start until then.
              </p>
            )}
            {shift.inspection.passed && (
              <Button className="w-full" onClick={() => navigate('/driver/trip')}>Go to current trip</Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const answered = CHECKLIST.filter((c) => answers[c.key] !== undefined && answers[c.key] !== null).length
  const failed = CHECKLIST.filter((c) => answers[c.key] === false)
  const complete = answered === CHECKLIST.length && (failed.length === 0 || defects.trim().length > 0)

  function submit() {
    if (!shift.vehicle || !profile) return
    const checklist: VehicleInspectionItem[] = CHECKLIST.map((c) => ({ key: c.key, label: c.label, passed: answers[c.key] === true }))
    const result = submitVehicleInspection(
      { vehicle_id: shift.vehicle.id, driver_id: profile.id, trip_id: shift.current?.trip.id ?? null, checklist, defects, odometer_km: Number(odometer) || shift.vehicle.odometer_km },
      actor,
    )
    if (!result.ok) {
      toast.error('Could not submit', { description: result.error })
      return
    }
    if (result.data.passed) {
      toast.success('Inspection passed', { description: 'You are cleared to start the trip.' })
      navigate('/driver/trip')
    } else {
      toast.warning('Inspection failed', { description: 'A supervisor has been notified. Do not depart.' })
    }
  }

  const groups = [...new Set(CHECKLIST.map((c) => c.group))]

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Pre-trip inspection"
        description={`${shift.vehicle.fleet_number} · ${shift.vehicle.registration_number}`}
      />

      <div className="sticky top-16 z-10 -mx-3 bg-background/90 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{answered} of {CHECKLIST.length} checked</span>
          {failed.length > 0 && <span className="font-semibold text-critical">{failed.length} failed</span>}
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${(answered / CHECKLIST.length) * 100}%` }} transition={{ duration: 0.3 }} />
        </div>
      </div>

      {groups.map((group) => (
        <Card key={group}>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{group}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {CHECKLIST.filter((c) => c.group === group).map((item) => {
              const value = answers[item.key]
              return (
                <div key={item.key} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
                  <span className="flex-1 text-sm">{item.label}</span>
                  <button
                    onClick={() => setAnswers({ ...answers, [item.key]: true })}
                    aria-label={`${item.label} — pass`}
                    className={cn('press grid size-10 place-items-center rounded-lg border transition-all', value === true ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/50')}
                  >
                    <Check className="size-5" />
                  </button>
                  <button
                    onClick={() => setAnswers({ ...answers, [item.key]: false })}
                    aria-label={`${item.label} — fail`}
                    className={cn('press grid size-10 place-items-center rounded-lg border transition-all', value === false ? 'border-critical bg-critical text-white' : 'border-border text-muted-foreground hover:border-critical/50')}
                  >
                    <X className="size-5" />
                  </button>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="space-y-1.5">
            <Label>Odometer (km)</Label>
            <Input value={odometer} inputMode="numeric" onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))} className="tnum" />
          </div>
          <div className="space-y-1.5">
            <Label required={failed.length > 0} hint={failed.length ? 'describe every failed item' : 'optional'}>Defects and notes</Label>
            <Textarea value={defects} onChange={(e) => setDefects(e.target.value)} />
          </div>
          <Button className="w-full" size="lg" disabled={!complete} onClick={submit}>
            Submit inspection
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
