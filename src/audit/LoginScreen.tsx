import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  continueSignIn,
  dismissPendingLink,
  RateLimitError,
  sendMagicLink,
  signInWithPassword,
  useAuth,
  verifyEmailCode,
} from './auth'
import { button, card, hint, input, label } from './ui/styles'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginScreen() {
  const { pendingLink } = useAuth()
  return pendingLink ? <ContinueSignIn /> : <SignInForm />
}

function ContinueSignIn() {
  const [busy, setBusy] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => buttonRef.current?.focus(), [])

  return (
    <div className="mx-auto max-w-md">
      <h1 className="m-0 font-serif text-3xl">Finish signing in</h1>
      <div className={`${card} mt-6 p-6`}>
        <p className="m-0 text-sm">Press the button to sign in to Audit Hub in this browser.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            ref={buttonRef}
            type="button"
            className={button('primary')}
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void continueSignIn().finally(() => setBusy(false))
            }}
          >
            {busy ? 'Signing in…' : 'Continue signing in'}
          </button>
          <button type="button" className={button('secondary')} disabled={busy} onClick={dismissPendingLink}>
            Cancel
          </button>
        </div>
        {busy && (
          <p role="status" className="sr-only">
            Signing in…
          </p>
        )}
      </div>
    </div>
  )
}

const CODE_RE = /^\d{6,10}$/

function SignInForm() {
  const id = useId()
  const { linkError } = useAuth()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [codeBusy, setCodeBusy] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)
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
          : err instanceof RateLimitError
            ? err.message
            : 'Could not send the sign-in link. Check your connection and try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (e: FormEvent) => {
    e.preventDefault()
    const value = code.replace(/\s/g, '')
    if (!CODE_RE.test(value)) {
      setCodeError('Enter the 6-digit code from the email.')
      codeRef.current?.focus()
      return
    }
    setCodeError('')
    setCodeBusy(true)
    try {
      await verifyEmailCode(sentTo, value)
    } catch {
      setCodeError('That code is incorrect or has expired. Check the latest email, or request a new link.')
      codeRef.current?.focus()
    } finally {
      setCodeBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 tabIndex={-1} className="m-0 font-serif text-3xl">
        Sign in to Audit Hub
      </h1>
      <p className="m-0 mt-2 text-[0.875rem] text-slate">
        Audit Hub is invitation only. Sign in with the email address you were invited with.
      </p>

      <div className={`${card} mt-6 p-6`}>
        {sentTo ? (
          <div>
            <div role="status" aria-live="polite">
              <h2 className="m-0 font-serif text-xl">Check your email</h2>
              <p className="m-0 mt-2 text-sm">
                If <strong className="break-all">{sentTo}</strong> has been invited to Audit Hub, we sent it a
                sign-in link and a 6-digit code. Open the link, or type the code here.
              </p>
            </div>
            <form onSubmit={(e) => void submitCode(e)} noValidate className="mt-4 grid gap-3">
              <div>
                <label htmlFor={`${id}-code`} className={label}>
                  Code from the email
                </label>
                <input
                  ref={codeRef}
                  id={`${id}-code`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={12}
                  className={input}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  aria-invalid={codeError ? true : undefined}
                  aria-describedby={codeError ? `${id}-code-error` : undefined}
                />
                {codeError && (
                  <p
                    id={`${id}-code-error`}
                    role="alert"
                    className="m-0 mt-1 text-xs font-semibold text-danger-text"
                  >
                    {codeError}
                  </p>
                )}
              </div>
              <button type="submit" className={button('primary')} disabled={codeBusy}>
                {codeBusy ? 'Signing in…' : 'Sign in with code'}
              </button>
            </form>
            <p className="m-0 mt-4 text-[0.8125rem] text-slate">
              Nothing after a few minutes? Check your spam folder, or ask the person who invited you to
              confirm the address they used.
            </p>
            <button
              type="button"
              className={button('secondary', 'mt-3')}
              onClick={() => {
                setSentTo('')
                setCode('')
                setCodeError('')
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
