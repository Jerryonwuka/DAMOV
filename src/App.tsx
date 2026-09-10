import { useEffect, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/auth/AuthProvider'
import { TooltipProvider } from '@/components/ui/misc'
import { DamovLogo } from '@/components/brand'
import { buildSeed } from '@/data/seed'
import { store } from '@/db/store'
import { AppRoutes } from '@/routes'
import { useTheme } from '@/hooks/use-theme'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
})

export default function App() {
  const [ready, setReady] = useState(false)
  const { theme } = useTheme()

  useEffect(() => {
    void store.hydrate(buildSeed).then(() => setReady(true))
  }, [])

  if (!ready) return <BootScreen />

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider delayDuration={250}>
            <AppRoutes />
            <Toaster
              position="top-right"
              theme={theme}
              richColors
              closeButton
              toastOptions={{ className: 'rounded-xl border-border shadow-lifted' }}
            />
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

function BootScreen() {
  return (
    <div className="forest-gradient grid min-h-screen place-items-center text-white">
      <div className="flex flex-col items-center gap-5">
        <DamovLogo size="lg" className="animate-rise-in" />
        <div className="h-1 w-40 overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-1/3 animate-[shimmer_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
        <p className="text-xs tracking-wide text-white/60">Preparing the Abuja operating day…</p>
      </div>
    </div>
  )
}
