import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { HUB_PATH } from './router'

export const BUCKET = 'audit-screenshots'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

// PKCE returns ?code=… instead of tokens in the hash, which the hub uses for routing.
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export function authRedirectUrl() {
  return `${window.location.origin}${HUB_PATH}`
}

export function extensionFor(type: string) {
  return (
    ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' } as const)[
      type as 'image/png'
    ] ?? 'png'
  )
}

const SIGNED_URL_TTL = 60 * 60
const signed = new Map<string, { url: string; expires: number }>()

export async function signedUrl(path: string): Promise<string> {
  const hit = signed.get(path)
  if (hit && hit.expires - Date.now() > 5 * 60 * 1000) return hit.url
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  if (error || !data) throw error ?? new Error('Could not load screenshot.')
  signed.set(path, { url: data.signedUrl, expires: Date.now() + SIGNED_URL_TTL * 1000 })
  return data.signedUrl
}

export async function downloadObject(path: string): Promise<Blob> {
  const { data, error } = await db().storage.from(BUCKET).download(path)
  if (error || !data) throw error ?? new Error('Could not download screenshot.')
  return data
}

export async function uploadObject(path: string, blob: Blob, contentType: string) {
  const { error } = await db().storage.from(BUCKET).upload(path, blob, { contentType, upsert: true })
  if (error) throw error
}

export async function removeObjects(paths: string[]) {
  const list = paths.filter(Boolean)
  if (!list.length) return
  signed.forEach((_, key) => list.includes(key) && signed.delete(key))
  await db().storage.from(BUCKET).remove(list)
}
