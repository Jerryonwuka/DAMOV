import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'

/**
 * Renders the ticket's opaque token as a QR code.
 *
 * The token carries no passenger data, no fare and no staff identifier — the
 * boarding endpoint resolves it server-side. A screenshot of this code proves
 * nothing about the person holding it beyond what the server chooses to return.
 */
export function QrToken({ token, size = 200, className }: { token: string; size?: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!canvas.current) return
    QRCode.toCanvas(canvas.current, token, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0E392C', light: '#FFFFFF' },
    }).catch(() => setFailed(true))
  }, [token, size])

  if (failed) {
    return (
      <div
        className={cn('grid place-items-center rounded-xl bg-muted text-center text-xs text-muted-foreground', className)}
        style={{ width: size, height: size }}
      >
        Show the ticket code to the agent
      </div>
    )
  }

  return (
    <canvas
      ref={canvas}
      className={cn('rounded-xl bg-white p-2 shadow-subtle', className)}
      aria-label="Boarding QR code"
    />
  )
}
