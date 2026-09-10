import {
  Activity, AlertTriangle, BadgeCheck, BarChart3, Banknote, Bus, CalendarClock, ClipboardCheck,
  Coins, Compass, CreditCard, Database, FileBarChart, Fingerprint, Gauge, Home, Landmark, ListChecks,
  Map, MapPinned,Plug, Receipt, ScrollText, Settings, ShieldCheck, Ticket, UserCog, Users, Wallet,
  Wrench,
} from 'lucide-react'
import type { Permission, Surface } from '@/auth/permissions'

export interface NavItem {
  to: string
  label: string
  icon: typeof Home
  permission: Permission
  end?: boolean
  /** Shown in the mobile tab bar for rider and driver surfaces. */
  primary?: boolean
  /** Compact label for the mobile tab bar. */
  short?: string
}

export interface NavSection {
  label?: string
  items: NavItem[]
}

export const SURFACE_NAV: Record<Surface, NavSection[]> = {
  rider: [
    {
      items: [
        { to: '/rider', label: 'Home', icon: Home, permission: 'rider.book', end: true, primary: true },
        { to: '/rider/book', label: 'Book', icon: Compass, permission: 'rider.book', primary: true },
        { to: '/rider/trips', label: 'My Trips', icon: CalendarClock, permission: 'rider.tickets', primary: true },
        { to: '/rider/tickets', label: 'Tickets', icon: Ticket, permission: 'rider.tickets', primary: true },
        { to: '/rider/notifications', label: 'Notifications', icon: Activity, permission: 'rider.tickets' },
        { to: '/rider/profile', label: 'Profile', icon: UserCog, permission: 'rider.tickets', primary: true },
      ],
    },
  ],
  hub: [
    {
      items: [
        { to: '/hub', label: 'Terminal Overview', icon: Landmark, permission: 'hub.overview', end: true, primary: true },
        { to: '/hub/sell', label: 'Sell Ticket', icon: Receipt, permission: 'hub.sell', primary: true },
        { to: '/hub/departures', label: 'Departures', icon: CalendarClock, permission: 'hub.overview' },
        { to: '/hub/boarding', label: 'Boarding', icon: BadgeCheck, permission: 'hub.board', primary: true },
        { to: '/hub/lookup', label: 'Passenger Lookup', icon: Users, permission: 'hub.lookup' },
        { to: '/hub/cash', label: 'Cash Session', icon: Wallet, permission: 'hub.cash_session', primary: true },
        { to: '/hub/incidents', label: 'Incidents', icon: AlertTriangle, permission: 'hub.incidents' },
      ],
    },
  ],
  driver: [
    {
      items: [
        { to: '/driver', label: "Today's Assignment", short: 'Shift', icon: Bus, permission: 'driver.assignment', end: true, primary: true },
        { to: '/driver/inspection', label: 'Vehicle Inspection', short: 'Inspect', icon: ClipboardCheck, permission: 'driver.inspection', primary: true },
        { to: '/driver/trip', label: 'Current Trip', short: 'Trip', icon: Gauge, permission: 'driver.trip', primary: true },
        { to: '/driver/stops', label: 'Stops', icon: MapPinned, permission: 'driver.trip', primary: true },
        { to: '/driver/incidents', label: 'Incidents', icon: AlertTriangle, permission: 'hub.incidents' },
        { to: '/driver/shift', label: 'Shift Summary', icon: ListChecks, permission: 'driver.assignment' },
      ],
    },
  ],
  control: [
    {
      label: 'Operate',
      items: [
        { to: '/control', label: 'Command Centre', icon: Activity, permission: 'control.command_centre', end: true },
        { to: '/control/map', label: 'Live Map', icon: Map, permission: 'control.live_map' },
        { to: '/control/dispatch', label: 'Dispatch', icon: Compass, permission: 'control.dispatch' },
        { to: '/control/manifest', label: 'Bookings & Boarding', icon: Ticket, permission: 'control.manifest' },
        { to: '/control/incidents', label: 'Incidents', icon: AlertTriangle, permission: 'control.incidents' },
      ],
    },
    {
      label: 'Network',
      items: [
        { to: '/control/network', label: 'Routes & Stops', icon: MapPinned, permission: 'control.network' },
        { to: '/control/schedules', label: 'Schedules & Trips', icon: CalendarClock, permission: 'control.schedules' },
        { to: '/control/fleet', label: 'Fleet', icon: Bus, permission: 'control.fleet' },
        { to: '/control/drivers', label: 'Drivers', icon: Users, permission: 'control.drivers' },
      ],
    },
    {
      label: 'Money',
      items: [
        { to: '/control/revenue', label: 'Revenue & Reconciliation', icon: Banknote, permission: 'control.revenue' },
        { to: '/control/costs', label: 'Costs & Economics', icon: Coins, permission: 'control.costs' },
        { to: '/control/reports', label: 'Reports', icon: FileBarChart, permission: 'control.reports' },
      ],
    },
    {
      label: 'Govern',
      items: [
        { to: '/control/configuration', label: 'Configuration', icon: Settings, permission: 'control.configuration' },
        { to: '/control/audit', label: 'Audit Logs', icon: ScrollText, permission: 'control.audit' },
      ],
    },
  ],
  institution: [
    {
      items: [
        { to: '/institution', label: 'Programme Overview', icon: BarChart3, permission: 'institution.overview', end: true },
        { to: '/institution/riders', label: 'Eligible Riders', icon: Users, permission: 'institution.riders' },
        { to: '/institution/policy', label: 'Subsidy Rules', icon: ShieldCheck, permission: 'institution.policies' },
        { to: '/institution/usage', label: 'Usage', icon: Activity, permission: 'institution.overview' },
        { to: '/institution/budget', label: 'Budget & Spend', icon: CreditCard, permission: 'institution.budget' },
        { to: '/institution/routes', label: 'Routes', icon: Map, permission: 'institution.overview' },
        { to: '/institution/reports', label: 'Reports', icon: FileBarChart, permission: 'institution.reports' },
      ],
    },
  ],
  admin: [
    {
      items: [
        { to: '/admin', label: 'Organizations', icon: Landmark, permission: 'admin.organizations', end: true },
        { to: '/admin/users', label: 'Users & Roles', icon: UserCog, permission: 'admin.users' },
        { to: '/admin/access', label: 'Access Policies', icon: Fingerprint, permission: 'admin.access_policies' },
        { to: '/admin/configuration', label: 'Global Configuration', icon: Settings, permission: 'admin.organizations' },
        { to: '/admin/integrations', label: 'Integrations', icon: Plug, permission: 'admin.integrations' },
        { to: '/admin/imports', label: 'Data Imports', icon: Database, permission: 'admin.data_imports' },
        { to: '/admin/security', label: 'Audit & Security', icon: ShieldCheck, permission: 'admin.security' },
      ],
    },
  ],
}

export const SURFACE_ICON: Record<Surface, typeof Home> = {
  rider: Ticket,
  hub: Landmark,
  driver: Bus,
  control: Activity,
  institution: BarChart3,
  admin: Wrench,
}
