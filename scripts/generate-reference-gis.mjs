/**
 * Generates the Damov reference GIS dataset (src/data/geo/*.json).
 *
 * This stands in for the export of the existing Abuja route map
 * (kinghardey.github.io/DAMOV-) which is not reachable from this build
 * environment. It reproduces the same shape — 14 route LineStrings,
 * 36 bus-stop points, 66 proposed transit-hub points, primary/secondary
 * categories — including the data-quality defects the import screen must
 * flag (unnamed hubs, missing codes, placeholder names, duplicate
 * coordinates, unsnapped stops).
 *
 * Replace these files with the authentic export via
 * Control → Routes & Stops → Import GeoJSON when it is available.
 */
import { writeFileSync, mkdirSync } from 'node:fs'

const OUT = new URL('../src/data/geo/', import.meta.url)
mkdirSync(OUT, { recursive: true })

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(20260910)

/** Densifies a waypoint list into a road-like polyline with gentle lateral drift. */
function polyline(waypoints, perLeg = 9, drift = 0.0032) {
  const coords = []
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [x1, y1] = waypoints[i]
    const [x2, y2] = waypoints[i + 1]
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    for (let s = 0; s < perLeg; s++) {
      const t = s / perLeg
      // Sinusoidal bow + small noise: reads as a road, not a ruler line.
      const bow = Math.sin(t * Math.PI) * drift * (0.5 + rand())
      coords.push([
        +(x1 + dx * t + nx * bow + (rand() - 0.5) * 0.0004).toFixed(6),
        +(y1 + dy * t + ny * bow + (rand() - 0.5) * 0.0004).toFixed(6),
      ])
    }
  }
  coords.push(waypoints[waypoints.length - 1].map((n) => +n.toFixed(6)))
  return coords
}

const P = {
  cbd: [7.4913, 9.0563], berger: [7.4693, 9.047], area1: [7.4834, 9.029], garki3: [7.493, 9.033],
  asokoro: [7.523, 9.04], kugbo: [7.52, 9.03], karu: [7.545, 9.018], nyanya: [7.575, 9.006],
  mararaba: [7.618, 8.988], jikwoyi: [7.59, 8.97], karshi: [7.635, 8.93], orozo: [7.63, 9.02],
  wuse4: [7.4746, 9.0665], wuse2: [7.4629, 9.079], maitama: [7.49, 9.09], utako: [7.44, 9.07],
  jabi: [7.43, 9.07], wuye: [7.45, 9.05], jahi: [7.43, 9.08], kado: [7.425, 9.09],
  lifecamp: [7.43, 9.093], gwarinpa: [7.405, 9.108], kubwa: [7.33, 9.15], deidei: [7.33, 9.10],
  zuba: [7.20, 9.10], idu: [7.37, 9.07], katampe: [7.46, 9.10], galadimawa: [7.44, 8.995],
  apo: [7.47, 8.995], gamesvillage: [7.46, 9.01], durumi: [7.47, 9.02], lugbe: [7.38, 8.98],
  airport: [7.272, 9.006], kuje: [7.227, 8.879], gwagwalada: [7.08, 8.94], dutse: [7.36, 9.13],
  bwari: [7.38, 9.28], suleja: [7.18, 9.18], nyanyagwandara: [7.60, 8.96], gudu: [7.465, 9.02],
}

/** 14 corridors, matching the categories in the source dataset. */
const routeDefs = [
  { code: 'AB-01', name: 'Mararaba — CBD Trunk', short: 'Mararaba ↔ CBD', type: 'primary_trunk', color: '#6FBF48',
    wp: [P.mararaba, P.nyanya, P.karu, P.kugbo, P.area1, P.berger, P.cbd] },
  { code: 'AB-02', name: 'Kubwa — CBD Expressway', short: 'Kubwa ↔ CBD', type: 'primary_trunk', color: '#38BDF8',
    wp: [P.kubwa, P.deidei, P.gwarinpa, P.lifecamp, P.jabi, P.utako, P.wuse2, P.wuse4, P.cbd] },
  { code: 'AB-03', name: 'Airport Road Trunk', short: 'Airport ↔ CBD', type: 'primary_trunk', color: '#E9B10A',
    wp: [P.airport, P.lugbe, P.galadimawa, P.gudu, P.area1, P.berger, P.cbd] },
  { code: 'AB-04', name: 'Nyanya — Wuse Circuit', short: 'Nyanya ↔ Wuse', type: 'primary_trunk', color: '#A78BFA',
    wp: [P.nyanya, P.karu, P.asokoro, P.cbd, P.wuse4, P.wuse2] },
  { code: 'AB-05', name: 'Gwarinpa — Berger Link', short: 'Gwarinpa ↔ Berger', type: 'primary_trunk', color: '#F472B6',
    wp: [P.gwarinpa, P.lifecamp, P.kado, P.jahi, P.utako, P.wuye, P.berger] },
  { code: 'AB-06', name: 'Apo — Maitama Cross-Town', short: 'Apo ↔ Maitama', type: 'primary_trunk', color: '#D9522A',
    wp: [P.apo, P.gamesvillage, P.durumi, P.area1, P.cbd, P.wuse4, P.maitama] },
  { code: 'AB-07', name: 'Jikwoyi Feeder', short: 'Jikwoyi ↔ Nyanya', type: 'secondary_feeder', color: '#34D399',
    wp: [P.karshi, P.jikwoyi, P.nyanyagwandara, P.nyanya] },
  { code: 'AB-08', name: 'Orozo — Karu Feeder', short: 'Orozo ↔ Karu', type: 'secondary_feeder', color: '#60A5FA',
    wp: [P.orozo, P.jikwoyi, P.karu] },
  { code: 'AB-09', name: 'Lugbe — Galadimawa Feeder', short: 'Lugbe ↔ Galadimawa', type: 'secondary_feeder', color: '#FBBF24',
    wp: [P.lugbe, P.galadimawa, P.apo] },
  { code: 'AB-10', name: 'Idu Industrial Feeder', short: 'Idu ↔ Jabi', type: 'secondary_feeder', color: '#C084FC',
    wp: [P.idu, P.deidei, P.jabi] },
  { code: 'AB-11', name: 'Katampe — Wuse Feeder', short: 'Katampe ↔ Wuse', type: 'secondary_feeder', color: '#22D3EE',
    wp: [P.katampe, P.maitama, P.wuse2, P.wuse4] },
  { code: 'AB-12', name: 'Kuje — Airport Feeder', short: 'Kuje ↔ Airport', type: 'secondary_feeder', color: '#FB7185',
    wp: [P.kuje, P.airport] },
  { code: 'AB-13', name: 'Zuba — Kubwa Feeder', short: 'Zuba ↔ Kubwa', type: 'secondary_feeder', color: '#A3E635',
    wp: [P.zuba, P.suleja, P.dutse, P.kubwa] },
  // Deliberate source defect: no route code, placeholder name. The import screen must flag this.
  { code: null, name: 'OD - Nyanyan', short: 'OD - Nyanyan', type: 'primary_trunk', color: '#94A3B8',
    wp: [P.mararaba, P.nyanya, P.karu, P.cbd] },
]

const routes = {
  type: 'FeatureCollection',
  name: 'damov_reference_routes',
  features: routeDefs.map((r, i) => ({
    type: 'Feature',
    id: `route-${i}`,
    properties: {
      source_index: i,
      route_code: r.code,
      route_name: r.name,
      public_name: r.short,
      category: r.type === 'primary_trunk' ? 'Primary / Trunk' : 'Secondary / Feeder',
      color: r.color,
      service_status: i < 9 ? 'proposed' : null,
    },
    geometry: { type: 'LineString', coordinates: polyline(r.wp, r.wp.length > 5 ? 7 : 10) },
  })),
}

const stopNames = [
  ['Mararaba Park', P.mararaba], ['New Nyanya', [7.6, 8.996]], ['Nyanya Bridge', P.nyanya],
  ['Karu Junction', P.karu], ['Kugbo Market', P.kugbo], ['AYA Roundabout', [7.512, 9.036]],
  ['Area 1 Junction', P.area1], ['Berger Roundabout', P.berger], ['Federal Secretariat', [7.4885, 9.0505]],
  ['CBD Terminal', P.cbd], ['Wuse Zone 4', P.wuse4], ['Wuse Market', P.wuse2],
  ['Banex Plaza', [7.4585, 9.0745]], ['Utako Market', P.utako], ['Jabi Motor Park', P.jabi],
  ['Jahi Junction', P.jahi], ['Kado Estate', P.kado], ['Life Camp Gate', P.lifecamp],
  ['Gwarinpa 3rd Avenue', P.gwarinpa], ['Dei-Dei Timber', P.deidei], ['Kubwa Village', P.kubwa],
  ['Zuba Market', P.zuba], ['Idu Train Station', P.idu], ['Katampe Extension', P.katampe],
  ['Maitama Junction', P.maitama], ['Wuye Junction', P.wuye], ['Gudu Market', P.gudu],
  ['Apo Legislative Quarters', P.apo], ['Games Village', P.gamesvillage], ['Durumi Junction', P.durumi],
  ['Galadimawa Roundabout', P.galadimawa], ['Lugbe FHA', P.lugbe], ['Airport Junction', P.airport],
  ['Jikwoyi Phase 2', P.jikwoyi], ['Orozo Town', P.orozo],
  // Deliberate source defect: placeholder name and coordinates far from every corridor.
  ['Stop 36', [7.318, 8.836]],
]

const stops = {
  type: 'FeatureCollection',
  name: 'damov_reference_stops',
  features: stopNames.map(([name, coord], i) => ({
    type: 'Feature',
    id: `stop-${i}`,
    properties: {
      source_index: i,
      stop_name: name,
      stop_code: i === 35 ? null : `S${String(i + 1).padStart(3, '0')}`,
      shelter: i % 3 === 0,
      step_free: i % 4 !== 3,
    },
    geometry: { type: 'Point', coordinates: [+coord[0].toFixed(6), +coord[1].toFixed(6)] },
  })),
}

/** 66 proposed transit hubs scattered across the FCT and the Nasarawa commuter belt. */
const hubSeeds = [
  ['Mararaba Transit Hub', P.mararaba], ['Nyanya Transit Hub', P.nyanya], ['Karu Interchange', P.karu],
  ['CBD Central Interchange', P.cbd], ['Berger Interchange', P.berger], ['Wuse Zone 4 Hub', P.wuse4],
  ['Utako Interchange', P.utako], ['Jabi Interchange', P.jabi], ['Gwarinpa Hub', P.gwarinpa],
  ['Kubwa Interchange', P.kubwa], ['Dei-Dei Hub', P.deidei], ['Zuba Hub', P.zuba],
  ['Airport Interchange', P.airport], ['Lugbe Hub', P.lugbe], ['Apo Hub', P.apo],
  ['Galadimawa Hub', P.galadimawa], ['Maitama Hub', P.maitama], ['Asokoro Hub', P.asokoro],
  ['Katampe Hub', P.katampe], ['Idu Rail Hub', P.idu], ['Jikwoyi Hub', P.jikwoyi],
  ['Karshi Hub', P.karshi], ['Orozo Hub', P.orozo], ['Kuje Hub', P.kuje],
  ['Gwagwalada Hub', P.gwagwalada], ['Suleja Hub', P.suleja], ['Bwari Hub', P.bwari],
  ['Dutse Alhaji Hub', P.dutse], ['Life Camp Hub', P.lifecamp], ['Kado Hub', P.kado],
]
const hubFeatures = []
for (let i = 0; i < 66; i++) {
  const seed = hubSeeds[i % hubSeeds.length]
  const ring = Math.floor(i / hubSeeds.length)
  const lon = seed[1][0] + (ring === 0 ? 0 : (rand() - 0.5) * 0.055)
  const lat = seed[1][1] + (ring === 0 ? 0 : (rand() - 0.5) * 0.045)
  // Deliberate source defects: 5 unnamed hubs, 1 exact duplicate coordinate pair.
  const unnamed = [17, 31, 44, 52, 61].includes(i)
  const duplicate = i === 58
  hubFeatures.push({
    type: 'Feature',
    id: `hub-${i}`,
    properties: {
      source_index: i,
      hub_name: unnamed ? null : ring === 0 ? seed[0] : `${seed[0].replace(/ Hub| Interchange| Transit Hub/, '')} Node ${ring + 1}`,
      hub_code: unnamed ? null : `H${String(i + 1).padStart(3, '0')}`,
      proposed: true,
    },
    geometry: {
      type: 'Point',
      coordinates: duplicate
        ? hubFeatures[12].geometry.coordinates
        : [+lon.toFixed(6), +lat.toFixed(6)],
    },
  })
}
const hubs = { type: 'FeatureCollection', name: 'damov_reference_hubs', features: hubFeatures }

writeFileSync(new URL('routes.json', OUT), JSON.stringify(routes))
writeFileSync(new URL('stops.json', OUT), JSON.stringify(stops))
writeFileSync(new URL('hubs.json', OUT), JSON.stringify(hubs))
console.log(`routes=${routes.features.length} stops=${stops.features.length} hubs=${hubs.features.length}`)
