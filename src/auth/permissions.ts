import type { Role } from '@/lib/types'

/**
 * Capability-based access control.
 *
 * Navigation, routes and actions are all rendered from these capabilities
 * rather than from a role label, so adding a role never means hunting for
 * hidden buttons. In production the same matrix is enforced by Supabase RLS —
 * this layer decides what is *offered*, the database decides what is *allowed*.
 */
export const PERMISSIONS = [
  'rider.book',
  'rider.tickets',
  'hub.overview',
  'hub.sell',
  'hub.board',
  'hub.lookup',
  'hub.cash_session',
  'hub.incidents',
  'driver.assignment',
  'driver.inspection',
  'driver.trip',
  'control.command_centre',
  'control.live_map',
  'control.network',
  'control.schedules',
  'control.dispatch',
  'control.fleet',
  'control.drivers',
  'control.manifest',
  'control.revenue',
  'control.costs',
  'control.incidents',
  'control.reports',
  'control.configuration',
  'control.audit',
  'institution.overview',
  'institution.riders',
  'institution.policies',
  'institution.budget',
  'institution.reports',
  'admin.organizations',
  'admin.users',
  'admin.access_policies',
  'admin.integrations',
  'admin.data_imports',
  'admin.security',
  'action.override_boarding',
  'action.review_cash_variance',
  'action.publish_route',
  'action.assign_vehicle',
  'action.cancel_trip',
  'action.enter_costs',
  'action.edit_configuration',
  'action.export_sensitive',
  'action.view_passenger_identity',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const RIDER: Permission[] = ['rider.book', 'rider.tickets']

const HUB_AGENT: Permission[] = [
  'hub.overview', 'hub.sell', 'hub.board', 'hub.lookup', 'hub.cash_session', 'hub.incidents',
  'action.view_passenger_identity',
]

const DRIVER: Permission[] = ['driver.assignment', 'driver.inspection', 'driver.trip', 'hub.incidents']

const DISPATCHER: Permission[] = [
  'control.command_centre', 'control.live_map', 'control.network', 'control.schedules',
  'control.dispatch', 'control.fleet', 'control.drivers', 'control.manifest', 'control.incidents',
  'action.assign_vehicle', 'action.cancel_trip', 'action.view_passenger_identity',
]

const OPERATIONS_MANAGER: Permission[] = [
  ...DISPATCHER, 'control.revenue', 'control.costs', 'control.reports', 'control.configuration',
  'control.audit', 'action.publish_route', 'action.edit_configuration', 'action.export_sensitive',
]

const FINANCE_OFFICER: Permission[] = [
  'control.command_centre', 'control.revenue', 'control.costs', 'control.manifest',
  'control.reports', 'control.audit', 'action.enter_costs', 'action.review_cash_variance',
  'action.export_sensitive',
]

const SUPERVISOR: Permission[] = [
  'hub.overview', 'hub.board', 'hub.lookup', 'hub.cash_session', 'hub.incidents',
  'control.command_centre', 'control.dispatch', 'control.manifest', 'control.incidents',
  'action.override_boarding', 'action.review_cash_variance', 'action.view_passenger_identity',
]

const INSTITUTION_ADMIN: Permission[] = [
  'institution.overview', 'institution.riders', 'institution.policies', 'institution.budget',
  'institution.reports',
]

const EXECUTIVE_VIEWER: Permission[] = [
  'control.command_centre', 'control.live_map', 'control.reports', 'control.revenue',
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  rider: RIDER,
  hub_agent: HUB_AGENT,
  driver: DRIVER,
  dispatcher: DISPATCHER,
  operations_manager: OPERATIONS_MANAGER,
  finance_officer: FINANCE_OFFICER,
  supervisor: SUPERVISOR,
  institution_admin: INSTITUTION_ADMIN,
  executive_viewer: EXECUTIVE_VIEWER,
  super_admin: [...PERMISSIONS],
}

export const ROLE_LABELS: Record<Role, string> = {
  rider: 'Passenger',
  hub_agent: 'Hub agent',
  driver: 'Driver',
  dispatcher: 'Dispatcher',
  operations_manager: 'Operations manager',
  finance_officer: 'Finance officer',
  supervisor: 'Supervisor',
  institution_admin: 'Institution admin',
  executive_viewer: 'Executive viewer',
  super_admin: 'Super admin',
}

export type Surface = 'rider' | 'hub' | 'driver' | 'control' | 'institution' | 'admin'

export const SURFACE_LABELS: Record<Surface, string> = {
  rider: 'Damov Rider Lite',
  hub: 'Damov Hub',
  driver: 'Damov Driver',
  control: 'Damov Control',
  institution: 'Damov Institutional',
  admin: 'Damov Super Admin',
}

/** The surface a role lands on after sign-in. */
export const ROLE_HOME: Record<Role, string> = {
  rider: '/rider',
  hub_agent: '/hub',
  driver: '/driver',
  dispatcher: '/control',
  operations_manager: '/control',
  finance_officer: '/control/revenue',
  supervisor: '/control',
  institution_admin: '/institution',
  executive_viewer: '/control',
  super_admin: '/control',
}

export function hasPermission(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission)
}

/** Every surface a role can reach — drives the surface switcher in the top bar. */
export function surfacesFor(role: Role): Surface[] {
  const permissions = ROLE_PERMISSIONS[role]
  const surfaces: Surface[] = []
  if (permissions.some((p) => p.startsWith('rider.'))) surfaces.push('rider')
  if (permissions.some((p) => p.startsWith('hub.'))) surfaces.push('hub')
  if (permissions.some((p) => p.startsWith('driver.'))) surfaces.push('driver')
  if (permissions.some((p) => p.startsWith('control.'))) surfaces.push('control')
  if (permissions.some((p) => p.startsWith('institution.'))) surfaces.push('institution')
  if (permissions.some((p) => p.startsWith('admin.'))) surfaces.push('admin')
  return surfaces
}
