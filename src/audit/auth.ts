import type { Session } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { authRedirectUrl, supabase } from './supabase'

type AuthState = {
  status: 'loading' | 'signed-out' | 'signed-in'
  session: Session | null
  linkError: string
  /** A sign-in link was opened and is waiting for the person to press "Continue signing in". */
  pendingLink: boolean
}

let state: AuthState = {
  status: supabase ? 'loading' : 'signed-out',
  session: null,
  linkError: '',
  pendingLink: false,
}
let pendingTokenHash = ''
const listeners = new Set<() => void>()

function set(session: Session | null, linkError = state.linkError) {
  const next: AuthState = {
    status: session ? 'signed-in' : 'signed-out',
    session,
    linkError,
    pendingLink: !session && Boolean(pendingTokenHash),
  }
  if (
    next.status === state.status &&
    next.session?.user.id === state.session?.user.id &&
    next.linkError === state.linkError &&
    next.pendingLink === state.pendingLink
  )
    return
  state = next
  listeners.forEach((l) => l())
}

// Sign-in emails link to /audit-hub?token_hash=…&type=email (see supabase/templates). A token hash works
// in any browser, unlike a PKCE code, which only the requesting browser can exchange. The token is
// single-use, and corporate email scanners open links and run their scripts before the person clicks,
// so it is verified only when the person presses "Continue signing in", never on page load.
function clearLinkParams() {
  const url = new URL(window.location.href)
  url.searchParams.delete('token_hash')
  url.searchParams.delete('type')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
}

async function init() {
  const client = supabase!
  pendingTokenHash = new URL(window.location.href).searchParams.get('token_hash') ?? ''
  const { data } = await client.auth.getSession()
  if (data.session && pendingTokenHash) {
    pendingTokenHash = ''
    clearLinkParams()
  }
  set(data.session)
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

export async function continueSignIn() {
  const tokenHash = pendingTokenHash
  const { data, error } = await supabase!.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
  pendingTokenHash = ''
  clearLinkParams()
  set(
    error ? null : data.session,
    error
      ? 'That sign-in link has expired or was already used. Request a new one below. When it arrives, you can type its 6-digit code here instead of opening the link.'
      : '',
  )
}

export function dismissPendingLink() {
  pendingTokenHash = ''
  clearLinkParams()
  set(state.session, '')
}

export async function verifyEmailCode(email: string, code: string) {
  const { data, error } = await supabase!.auth.verifyOtp({ email, token: code, type: 'email' })
  if (error) throw error
  pendingTokenHash = ''
  if (new URL(window.location.href).searchParams.has('token_hash')) clearLinkParams()
  set(data.session, '')
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
