import { useId, useRef, useState, type FormEvent } from 'react'
import { sendMagicLink, signInWithPassword, useAuth } from './auth'
import { button, card, hint, input, label } from './ui/styles'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginScreen() {
  const id = useId()
  const { linkError } = useAuth()
  const [mode, setMode] = useState<'link' | 'password'>('link')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [busy, setBusy] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const value = email.trim()
    if (!EMAIL_RE.test(value)) {
      setEmailError('Enter your email address, like name@example.com.')
      emailRef.current?.focus()
      return
    }
    setEmailError('')
    if (mode === 'password' && !password) {
      setError('Enter your password.')
      passwordRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      if (mode === 'link') {
        await sendMagicLink(value)
        setSentTo(value)
      } else {
        await signInWithPassword(value, password)
      }
    } catch (err) {
      setError(
        mode === 'password'
          ? 'That email and password did not match. Try again or use a sign-in link.'
          : err instanceof Error
            ? `Could not send the sign-in link: ${err.message}`
            : 'Could not send the sign-in link.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 tabIndex={-1} className="m-0 font-serif text-3xl">
        Sign in to Audit Hub
      </h1>
      <p className="m-0 mt-2 text-[0.875rem] text-slate">
        Audit projects are private. Sign in with the email address you were invited with.
      </p>

      <div className={`${card} mt-6 p-6`}>
        {sentTo ? (
          <div role="status" aria-live="polite">
            <h2 className="m-0 font-serif text-xl">Check your email</h2>
            <p className="m-0 mt-2 text-sm">
              We sent a sign-in link to <strong className="break-all">{sentTo}</strong>. Open it in this
              browser to finish signing in.
            </p>
            <button
              type="button"
              className={button('secondary', 'mt-4')}
              onClick={() => {
                setSentTo('')
                requestAnimationFrame(() => emailRef.current?.focus())
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
            {linkError && !error && (
              <p role="alert" className="m-0 text-sm font-semibold text-danger-text">
                {linkError}
              </p>
            )}
            <div>
              <label htmlFor={`${id}-email`} className={label}>
                Email
              </label>
              <input
                ref={emailRef}
                id={`${id}-email`}
                type="email"
                autoComplete="email"
                className={input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? `${id}-email-error` : undefined}
              />
              {emailError && (
                <p id={`${id}-email-error`} className="m-0 mt-1 text-xs font-semibold text-danger-text">
                  {emailError}
                </p>
              )}
            </div>
            {mode === 'password' && (
              <div>
                <label htmlFor={`${id}-password`} className={label}>
                  Password
                </label>
                <input
                  ref={passwordRef}
                  id={`${id}-password`}
                  type="password"
                  autoComplete="current-password"
                  className={input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            {error && (
              <p role="alert" className="m-0 text-sm font-semibold text-danger-text">
                {error}
              </p>
            )}
            <button type="submit" className={button('primary')} disabled={busy}>
              {busy ? 'Please wait…' : mode === 'link' ? 'Email me a sign-in link' : 'Sign in'}
            </button>
            {mode === 'link' && (
              <p className={`${hint} m-0`}>No password needed. The link signs you in on this device.</p>
            )}
            <button
              type="button"
              className="cursor-pointer justify-self-start rounded text-sm font-medium text-forest underline underline-offset-2"
              onClick={() => {
                setMode(mode === 'link' ? 'password' : 'link')
                setError('')
                requestAnimationFrame(() => (mode === 'link' ? passwordRef : emailRef).current?.focus())
              }}
            >
              {mode === 'link' ? 'Sign in with a password instead' : 'Email me a sign-in link instead'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
