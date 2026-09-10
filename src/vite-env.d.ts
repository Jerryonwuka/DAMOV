/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_MAP_STYLE_DARK?: string
  readonly VITE_MAP_STYLE_LIGHT?: string
  readonly VITE_PAYMENT_PROVIDER?: string
  readonly VITE_SMS_PROVIDER?: string
  readonly VITE_WHATSAPP_PROVIDER?: string
  readonly VITE_GPS_PROVIDER?: string
  readonly VITE_ENABLE_ROLE_SWITCHER?: string
  readonly VITE_ENABLE_TRIP_SIMULATOR?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
