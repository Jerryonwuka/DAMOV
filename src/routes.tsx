import { Suspense, lazy, type ComponentType } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { ROLE_HOME, type Permission } from '@/auth/permissions'
import { AppShell } from '@/components/layout/AppShell'
import { PermissionDenied } from '@/components/ui/patterns'
import { SkeletonTable } from '@/components/ui/skeleton'
import { SignInPage } from '@/features/auth/SignInPage'

/* Rider */
import { RiderHome } from '@/features/rider/RiderHome'
import { RiderBook } from '@/features/rider/RiderBook'
import { RiderTrips } from '@/features/rider/RiderTrips'
import { RiderTickets } from '@/features/rider/RiderTickets'
import { RiderNotifications } from '@/features/rider/RiderNotifications'
import { RiderProfile } from '@/features/rider/RiderProfile'

/* Hub */
import { HubOverview } from '@/features/hub/HubOverview'
import { HubSellTicket } from '@/features/hub/HubSellTicket'
import { HubDepartures } from '@/features/hub/HubDepartures'
import { HubBoarding } from '@/features/hub/HubBoarding'
import { HubLookup } from '@/features/hub/HubLookup'
import { HubCashSession } from '@/features/hub/HubCashSession'
import { IncidentCentre } from '@/features/shared/IncidentCentre'

/* Driver */
import { DriverAssignment } from '@/features/driver/DriverAssignment'
import { DriverInspection } from '@/features/driver/DriverInspection'
import { DriverTrip } from '@/features/driver/DriverTrip'
import { DriverStops } from '@/features/driver/DriverStops'
import { DriverShift } from '@/features/driver/DriverShift'

/* Control */
import { CommandCentre } from '@/features/control/CommandCentre'
import { NetworkPage } from '@/features/control/NetworkPage'
import { RouteDetailPage } from '@/features/control/RouteDetailPage'
import { SchedulesPage } from '@/features/control/SchedulesPage'
import { DispatchBoard } from '@/features/control/DispatchBoard'
import { FleetPage } from '@/features/control/FleetPage'
import { DriversPage } from '@/features/control/DriversPage'
import { ManifestPage } from '@/features/control/ManifestPage'
import { RevenuePage } from '@/features/control/RevenuePage'
import { CostsPage } from '@/features/control/CostsPage'
import { ReportsPage } from '@/features/control/ReportsPage'
import { ConfigurationPage } from '@/features/control/ConfigurationPage'
import { AuditPage } from '@/features/control/AuditPage'

/* Institutional */
import { ProgrammeOverview } from '@/features/institution/ProgrammeOverview'
import { EligibleRiders } from '@/features/institution/EligibleRiders'
import { SubsidyPolicyBuilder } from '@/features/institution/SubsidyPolicyBuilder'
import { ProgrammeUsage } from '@/features/institution/ProgrammeUsage'
import { ProgrammeBudget } from '@/features/institution/ProgrammeBudget'
import { ProgrammeRoutes } from '@/features/institution/ProgrammeRoutes'
import { ProgrammeReports } from '@/features/institution/ProgrammeReports'

/* Administration */
import {
  OrganizationsPage, UsersRolesPage, AccessPoliciesPage, IntegrationsPage, DataImportsPage,
  SecurityPage,
} from '@/features/admin/AdminPages'

/** The live map carries MapLibre, so it is split out of the main bundle. */
const LiveMapPage = lazy(() =>
  import('@/features/control/LiveMapPage').then((m) => ({ default: m.LiveMapPage })),
)

function Guarded({ permission, component: Component }: { permission: Permission; component: ComponentType }) {
  const { can } = useAuth()
  if (!can(permission)) return <PermissionDenied />
  return <Component />
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const location = useLocation()
  if (!session) return <Navigate to="/" replace state={{ from: location.pathname }} />
  return <AppShell>{children}</AppShell>
}

function guarded(permission: Permission, component: ComponentType) {
  return (
    <RequireAuth>
      <Suspense fallback={<SkeletonTable rows={8} />}>
        <Guarded permission={permission} component={component} />
      </Suspense>
    </RequireAuth>
  )
}

export function AppRoutes() {
  const { session, role } = useAuth()

  return (
    <Routes>
      <Route path="/" element={session && role ? <Navigate to={ROLE_HOME[role]} replace /> : <SignInPage />} />

      {/* Rider Lite */}
      <Route path="/rider" element={guarded('rider.book', RiderHome)} />
      <Route path="/rider/book" element={guarded('rider.book', RiderBook)} />
      <Route path="/rider/trips" element={guarded('rider.tickets', RiderTrips)} />
      <Route path="/rider/tickets" element={guarded('rider.tickets', RiderTickets)} />
      <Route path="/rider/notifications" element={guarded('rider.tickets', RiderNotifications)} />
      <Route path="/rider/profile" element={guarded('rider.tickets', RiderProfile)} />

      {/* Hub */}
      <Route path="/hub" element={guarded('hub.overview', HubOverview)} />
      <Route path="/hub/sell" element={guarded('hub.sell', HubSellTicket)} />
      <Route path="/hub/departures" element={guarded('hub.overview', HubDepartures)} />
      <Route path="/hub/boarding" element={guarded('hub.board', HubBoarding)} />
      <Route path="/hub/lookup" element={guarded('hub.lookup', HubLookup)} />
      <Route path="/hub/cash" element={guarded('hub.cash_session', HubCashSession)} />
      <Route path="/hub/incidents" element={guarded('hub.incidents', IncidentCentre)} />

      {/* Driver */}
      <Route path="/driver" element={guarded('driver.assignment', DriverAssignment)} />
      <Route path="/driver/inspection" element={guarded('driver.inspection', DriverInspection)} />
      <Route path="/driver/trip" element={guarded('driver.trip', DriverTrip)} />
      <Route path="/driver/stops" element={guarded('driver.trip', DriverStops)} />
      <Route path="/driver/incidents" element={guarded('hub.incidents', IncidentCentre)} />
      <Route path="/driver/shift" element={guarded('driver.assignment', DriverShift)} />

      {/* Control */}
      <Route path="/control" element={guarded('control.command_centre', CommandCentre)} />
      <Route path="/control/map" element={guarded('control.live_map', LiveMapPage)} />
      <Route path="/control/network" element={guarded('control.network', NetworkPage)} />
      <Route path="/control/network/:routeId" element={guarded('control.network', RouteDetailPage)} />
      <Route path="/control/schedules" element={guarded('control.schedules', SchedulesPage)} />
      <Route path="/control/dispatch" element={guarded('control.dispatch', DispatchBoard)} />
      <Route path="/control/fleet" element={guarded('control.fleet', FleetPage)} />
      <Route path="/control/drivers" element={guarded('control.drivers', DriversPage)} />
      <Route path="/control/manifest" element={guarded('control.manifest', ManifestPage)} />
      <Route path="/control/revenue" element={guarded('control.revenue', RevenuePage)} />
      <Route path="/control/costs" element={guarded('control.costs', CostsPage)} />
      <Route path="/control/incidents" element={guarded('control.incidents', IncidentCentre)} />
      <Route path="/control/reports" element={guarded('control.reports', ReportsPage)} />
      <Route path="/control/configuration" element={guarded('control.configuration', ConfigurationPage)} />
      <Route path="/control/audit" element={guarded('control.audit', AuditPage)} />

      {/* Institutional */}
      <Route path="/institution" element={guarded('institution.overview', ProgrammeOverview)} />
      <Route path="/institution/riders" element={guarded('institution.riders', EligibleRiders)} />
      <Route path="/institution/policy" element={guarded('institution.policies', SubsidyPolicyBuilder)} />
      <Route path="/institution/usage" element={guarded('institution.overview', ProgrammeUsage)} />
      <Route path="/institution/budget" element={guarded('institution.budget', ProgrammeBudget)} />
      <Route path="/institution/routes" element={guarded('institution.overview', ProgrammeRoutes)} />
      <Route path="/institution/reports" element={guarded('institution.reports', ProgrammeReports)} />

      {/* Super admin */}
      <Route path="/admin" element={guarded('admin.organizations', OrganizationsPage)} />
      <Route path="/admin/users" element={guarded('admin.users', UsersRolesPage)} />
      <Route path="/admin/access" element={guarded('admin.access_policies', AccessPoliciesPage)} />
      <Route path="/admin/configuration" element={guarded('admin.organizations', ConfigurationPage)} />
      <Route path="/admin/integrations" element={guarded('admin.integrations', IntegrationsPage)} />
      <Route path="/admin/imports" element={guarded('admin.data_imports', DataImportsPage)} />
      <Route path="/admin/security" element={guarded('admin.security', SecurityPage)} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
