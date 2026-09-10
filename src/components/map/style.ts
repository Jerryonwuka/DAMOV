import type { StyleSpecification } from 'maplibre-gl'

export const DARK_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_DARK ?? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
export const LIGHT_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_LIGHT ?? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

/**
 * Basemap fallback.
 *
 * If the vector basemap cannot load — offline hub, blocked CDN, provider
 * outage — the map must still show the network. This neutral style keeps route
 * geometry, stops and vehicles fully usable with only the background missing.
 */
export function fallbackStyle(theme: 'dark' | 'light'): StyleSpecification {
  return {
    version: 8,
    name: 'Damov offline base',
    sources: {},
    layers: [
      {
        id: 'damov-fallback-background',
        type: 'background',
        paint: { 'background-color': theme === 'dark' ? '#0B2A20' : '#EEF2F0' },
      },
    ],
  }
}

/** Abuja network extent — the default camera before anything is selected. */
export const ABUJA_BOUNDS: [number, number, number, number] = [7.05, 8.83, 7.68, 9.32]
export const ABUJA_CENTER: [number, number] = [7.44, 9.03]
