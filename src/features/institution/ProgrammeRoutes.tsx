import { Suspense, lazy, useCallback } from 'react'
import { useDb } from '@/db/store'
import { useTheme } from '@/hooks/use-theme'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/ui/patterns'
import { km, naira } from '@/lib/format'
import { hubFeatures, routeFeatures, stopFeatures } from '@/lib/selectors'
import type { MapLayers } from '@/components/map/DamovMap'
import { useProgramme } from './institution-data'

const DamovMap = lazy(() => import('@/components/map/DamovMap').then((m) => ({ default: m.DamovMap })))

/** Routes covered by the programme. A lighter basemap for daylight reading; no vehicles, no passengers. */
export function ProgrammeRoutes() {
  const p = useProgramme()
  const { theme } = useTheme()
  const routes = useDb(
    useCallback(
      (db) => db.routes.filter((r) => r.status === 'published' && (!p.policy?.route_ids || p.policy.route_ids.includes(r.id))).map((route) => ({
        route,
        distance: db.route_geometry_versions.find((v) => v.id === route.current_geometry_version_id)?.distance_km ?? 0,
        stops: new Set(db.route_stops.filter((rs) => db.route_directions.some((d) => d.route_id === route.id && d.id === rs.route_direction_id)).map((rs) => rs.stop_id)).size,
        usage: p.corridors.find((c) => c.code === route.code),
      })),
      [p.policy?.route_ids, p.corridors],
    ),
  )
  const layers = useDb(
    useCallback(
      (db): MapLayers => {
        const ids = new Set(routes.map((r) => r.route.id))
        const all = routeFeatures(db, { statuses: ['published'] })
        return {
          routes: { ...all, features: all.features.filter((f) => ids.has(String(f.properties?.id))) },
          stops: stopFeatures(db, { onlyActive: true }),
          hubs: hubFeatures(db),
          vehicles: { type: 'FeatureCollection', features: [] },
          incidents: { type: 'FeatureCollection', features: [] },
        }
      },
      [routes],
    ),
  )

  return (
    <div className="space-y-5">
      <PageHeader title="Routes" description="Corridors covered by the programme and how much of this month's sponsored travel each carried." />
      <Card className="overflow-hidden">
        <div className="h-[420px]">
          <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
            <DamovMap layers={layers} theme={theme === 'dark' ? 'dark' : 'light'} mode="rider" showVehicles={false} showIncidents={false} showHubs={false} />
          </Suspense>
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {routes.map(({ route, distance, stops, usage }) => (
          <Card key={route.id}>
            <CardContent className="flex items-start gap-3 pt-5">
              <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: route.color }} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{route.code} · {route.public_name}</p>
                <p className="text-xs text-muted-foreground">{km(distance)} · {stops} stops · {route.service_class}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone="primary">{usage?.trips ?? 0} sponsored trips</Badge>
                  <Badge tone="neutral">{naira(usage?.subsidy ?? 0)} subsidy</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
