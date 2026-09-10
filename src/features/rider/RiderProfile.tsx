import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, LogOut, MapPin, Phone, ShieldCheck, User } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useOrganization, useRiderProfile } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/misc'
import { PageHeader } from '@/components/ui/patterns'
import { Separator } from '@/components/ui/separator'
import { lagosDate, naira } from '@/lib/format'
import { titleCase } from '@/lib/utils'
import { useState } from 'react'

export function RiderProfile() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const rider = useRiderProfile()
  const organization = useOrganization(rider?.organization_id)
  const [locationConsent, setLocationConsent] = useState(false)

  const lifetime = useDb(
    useCallback(
      (db) => {
        const mine = db.bookings.filter((b) => b.rider_id === profile?.id && b.status !== 'cancelled')
        return {
          trips: mine.length,
          paid: mine.reduce((a, b) => a + b.passenger_contribution, 0),
          sponsored: mine.reduce((a, b) => a + b.sponsor_contribution, 0),
        }
      },
      [profile?.id],
    ),
  )

  const policy = useDb(
    useCallback(
      (db) =>
        db.subsidy_policies.find((p) => p.organization_id === rider?.organization_id && p.status === 'published') ?? null,
      [rider?.organization_id],
    ),
  )

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Profile" />

      <Card>
        <CardContent className="flex items-center gap-4 pt-5">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
            <User className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{profile?.full_name}</p>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="size-3.5" /> <span className="tnum">{profile?.phone}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Institutional eligibility</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {organization ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm">
                  <Building2 className="size-4 text-muted-foreground" />
                  {organization.name}
                </span>
                <Badge tone={rider?.eligibility_state === 'verified' ? 'primary' : 'warning'}>
                  {titleCase(rider?.eligibility_state ?? 'unverified')}
                </Badge>
              </div>
              {rider?.staff_id && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Staff ID</span>
                  <span className="tnum">{rider.staff_id}</span>
                </div>
              )}
              {policy && (
                <div className="rounded-lg bg-primary/[0.07] p-3 text-xs leading-relaxed">
                  <p className="flex items-center gap-1.5 font-semibold text-primary-800 dark:text-primary-200">
                    <ShieldCheck className="size-3.5" /> {policy.name}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {policy.subsidy_type === 'fixed'
                      ? `${naira(policy.fixed_amount ?? 0)} covered per eligible trip`
                      : `${policy.percentage}% covered per eligible trip`}
                    {policy.max_trips_per_day ? `, up to ${policy.max_trips_per_day} trips a day` : ''}
                    {policy.time_bands?.length
                      ? `, within ${policy.time_bands.map((b) => `${b.start}–${b.end}`).join(' and ')}`
                      : ''}
                    . Valid to {lagosDate(`${policy.valid_to ?? policy.valid_from}T00:00:00Z`)}.
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              You are not linked to a sponsoring organisation, so you pay the standard fare.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Lifetime</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'Journeys', value: lifetime.trips.toString() },
            { label: 'You paid', value: naira(lifetime.paid) },
            { label: 'Sponsor paid', value: naira(lifetime.sponsored) },
          ].map((item) => (
            <div key={item.label} className="rounded-lg bg-muted/60 p-3">
              <p className="text-lg font-bold tnum">{item.value}</p>
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Privacy</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <MapPin className="size-3.5" /> Share my location while travelling
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Off by default. Location is never required to book or board — it only improves
                arrival estimates while you are on a trip, and you can withdraw it at any time.
              </p>
            </div>
            <Switch checked={locationConsent} onCheckedChange={setLocationConsent} aria-label="Share location" />
          </div>
          <Separator />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Damov treats movement data as security-sensitive. Your individual travel history is not
            shared with your organisation — sponsors see aggregated usage and the subsidy they
            funded, never a record of where a named person travelled.
          </p>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          signOut()
          navigate('/')
        }}
      >
        <LogOut className="size-4" /> Sign out
      </Button>
    </div>
  )
}
