import type { Session } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { authRedirectUrl, supabase } from './supabase'

type AuthState = {
  status: 'loading' | 'signed-out' | 'signed-in'
  session: Session | null
  linkError: string
}

let state: AuthState = { status: supabase ? 'loading' : 'signed-out', session: null, linkError: '' }
const listeners = new Set<() => void>()

function set(session: Session | null, linkError = state.linkError) {
  const next: AuthState = { status: session ? 'signed-in' : 'signed-out', session, linkError }
  if (
    next.status === state.status &&
    next.session?.user.id === state.session?.user.id &&
    next.linkError === state.linkError
  )
    return
  state = next
  listeners.forEach((l) => l())
}

// Sign-in emails link to /audit-hub?token_hash=…&type=email (see supabase/templates). Verifying the
// token hash works in any browser, unlike a PKCE code, which only the requesting browser can exchange.
async function init() {
  const client = supabase!
  const url = new URL(window.location.href)
  const tokenHash = url.searchParams.get('token_hash')
  let linkError = ''
  if (tokenHash) {
    url.searchParams.delete('token_hash')
    url.searchParams.delete('type')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
    if (error) linkError = 'That sign-in link has expired or was already used. Request a new one below.'
  }
  const { data } = await client.auth.getSession()
  set(data.session, linkError)
  client.auth.onAuthStateChange((_event, session) => set(session))
}

if (supabase) void init()

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

export async function sendMagicLink(email: string) {
  const { error } = await supabase!.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: authRedirectUrl() },
  })
  if (error) throw error
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase!.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOut() {
  await supabase!.auth.signOut()
}
