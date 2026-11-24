/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon (legacy JWT) or publishable (sb_publishable_…) key. Never a service-role/secret key. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}
