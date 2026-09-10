import { useEffect, useState } from 'react'

/** A shared ticking clock so live operational views age their data honestly. */
export function useClock(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
