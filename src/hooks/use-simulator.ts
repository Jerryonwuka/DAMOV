import { useCallback, useEffect, useState } from 'react'
import { simulateTick } from '@/server/telemetry'

const KEY = 'damov.simulator'
const ENABLED = import.meta.env.VITE_ENABLE_TRIP_SIMULATOR !== 'false'

/**
 * Development-only trip simulator.
 *
 * Moves seeded buses along their corridors so the operations map has motion to
 * look at. Always visibly labelled "Demo simulation", pausable, and compiled
 * out when `VITE_ENABLE_TRIP_SIMULATOR` is false.
 */
export function useTripSimulator(intervalMs = 12_000) {
  const [running, setRunning] = useState<boolean>(() => {
    if (!ENABLED) return false
    try {
      return localStorage.getItem(KEY) !== 'paused'
    } catch {
      return true
    }
  })

  useEffect(() => {
    if (!ENABLED || !running) return
    simulateTick()
    const id = setInterval(simulateTick, intervalMs)
    return () => clearInterval(id)
  }, [running, intervalMs])

  const toggle = useCallback(() => {
    setRunning((value) => {
      try {
        localStorage.setItem(KEY, value ? 'paused' : 'running')
      } catch {
        /* storage unavailable */
      }
      return !value
    })
  }, [])

  return { enabled: ENABLED, running, toggle }
}
