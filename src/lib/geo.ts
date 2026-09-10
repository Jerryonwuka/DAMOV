import length from '@turf/length'
import bbox from '@turf/bbox'
import along from '@turf/along'
import nearestPointOnLine from '@turf/nearest-point-on-line'
import { lineString, point } from '@turf/helpers'

export function lineLengthKm(geometry: GeoJSON.LineString) {
  return Math.round(length(lineString(geometry.coordinates), { units: 'kilometers' }) * 100) / 100
}

export function boundsOf(geometry: GeoJSON.Geometry): [number, number, number, number] {
  const [minX, minY, maxX, maxY] = bbox(geometry as never)
  return [minX, minY, maxX, maxY]
}

/** Point at a distance along a corridor — drives the demo vehicle simulator. */
export function pointAlong(geometry: GeoJSON.LineString, distanceKm: number): [number, number] {
  const feature = along(lineString(geometry.coordinates), distanceKm, { units: 'kilometers' })
  const [lon, lat] = feature.geometry.coordinates
  return [lon, lat]
}

export function bearingBetween(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const [lon1, lat1] = a.map(toRad) as [number, number]
  const [lon2, lat2] = b.map(toRad) as [number, number]
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Distance from a point to the closest of several corridors, in metres. */
export function nearestDistanceMetres(coord: [number, number], lines: GeoJSON.LineString[]): number | null {
  if (!lines.length) return null
  let best = Number.POSITIVE_INFINITY
  for (const line of lines) {
    if (line.coordinates.length < 2) continue
    const snapped = nearestPointOnLine(lineString(line.coordinates), point(coord), { units: 'kilometers' })
    const distance = (snapped.properties.dist ?? Number.POSITIVE_INFINITY) * 1000
    if (distance < best) best = distance
  }
  return Number.isFinite(best) ? best : null
}

/** Distance along a corridor to the closest point to `coord`, in kilometres. */
export function distanceAlongLineKm(line: GeoJSON.LineString, coord: [number, number]) {
  const snapped = nearestPointOnLine(lineString(line.coordinates), point(coord), { units: 'kilometers' })
  return Math.round((snapped.properties.location ?? 0) * 100) / 100
}

export function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}
