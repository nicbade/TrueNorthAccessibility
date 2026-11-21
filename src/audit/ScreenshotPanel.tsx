import { useEffect, useId, useRef, useState, type DragEvent } from 'react'
import { deleteScreenshot, getScreenshot, putScreenshot, readImageSize } from './screenshots'
import { updatePage } from './store'
import type { AuditPage } from './types'
import { button, card } from './ui/styles'

type Props = { page: AuditPage }

function formatBytes(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`
}

export default function ScreenshotPanel({ page }: Props) {
  const id = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fit, setFit] = useState(true)
  const [dragging, setDragging] = useState(false)
  const stamp = page.screenshot?.updatedAt

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    setLoading(true)
    getScreenshot(page.id)
      .then((blob) => {
        if (cancelled) return
        objectUrl = blob ? URL.createObjectURL(blob) : null
        setUrl(objectUrl)
      })
      .catch(() => !cancelled && setError('Could not read saved screenshots from this browser.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [page.id, stamp])

  const upload = async (file: File | undefined) => {
    if (!file) return
    setError('')
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file (PNG, JPEG, WebP or GIF).')
      return
    }
    setBusy(true)
    try {
      const size = await readImageSize(file)
      await putScreenshot(page.id, file)
      updatePage(page.id, {
        screenshot: {
          name: file.name,
          type: file.type,
          size: file.size,
          ...size,
          updatedAt: new Date().toISOString(),
        },
      })
      setMessage(`Screenshot ${file.name} uploaded.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = async () => {
    if (!window.confirm('Remove this screenshot?')) return
    await deleteScreenshot(page.id)
    updatePage(page.id, { screenshot: null })
    setMessage('Screenshot removed.')
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void upload(e.dataTransfer.files[0])
  }

  const meta = page.screenshot

  return (
    <section className={`${card} flex min-h-0 flex-col`} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider px-4 py-3">
        <div>
          <h2 id={`${id}-title`} className="m-0 font-serif text-lg">
            Screenshot
          </h2>
          {meta && (
            <p className="m-0 text-[0.75rem] leading-5 text-slate">
              {meta.name} · {meta.width}×{meta.height}px · {formatBytes(meta.size)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {url && (
            <button
              type="button"
              className={button('secondary')}
              aria-pressed={!fit}
              onClick={() => setFit((f) => !f)}
            >
              Actual size
            </button>
          )}
          <input
            ref={fileRef}
            id={`${id}-file`}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void upload(e.target.files?.[0])}
            disabled={busy}
          />
          <button
            type="button"
            className={button(url ? 'secondary' : 'primary')}
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? 'Uploading…' : url ? 'Replace' : 'Upload screenshot'}
          </button>
          {url && (
            <button type="button" className={button('danger')} onClick={() => void remove()}>
              Remove<span className="sr-only"> screenshot</span>
            </button>
          )}
        </div>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>
      {error && (
        <p
          role="alert"
          className="m-0 border-b border-danger-border bg-danger-bg px-4 py-2 text-[0.8125rem] font-semibold text-danger-text"
        >
          {error}
        </p>
      )}

      {loading ? (
        <p className="m-0 p-6 text-[0.875rem] text-slate">Loading screenshot…</p>
      ) : url ? (
        <div
          tabIndex={0}
          role="region"
          aria-label={`Screenshot of ${page.name}, scrollable`}
          className="h-[70vh] overflow-auto bg-cream "
        >
          <img
            src={url}
            alt={`Full-page screenshot of ${page.name}`}
            className={fit ? 'block h-auto w-full' : 'block max-w-none'}
          />
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`m-4 flex flex-1 flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center ${
            dragging ? 'border-forest bg-surface' : 'border-divider bg-cream'
          }`}
        >
          <svg
            aria-hidden="true"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            className="text-slate"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <p className="m-0 mt-3 text-[0.875rem] font-semibold text-ink">No screenshot yet</p>
          <p className="m-0 mt-1 text-[0.8125rem] text-slate">
            Upload a full-page capture, or drag and drop an image here. It is stored only in this browser.
          </p>
        </div>
      )}
    </section>
  )
}
