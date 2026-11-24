import { useState } from 'react'
import { archiveImportedAt, markArchiveImported, readBrowserArchive } from './browserArchive'
import { importBrowserData } from './importBrowserData'
import { useAuditData } from './store'
import { button } from './ui/styles'

export default function ImportBanner() {
  const { isOwner, userId } = useAuditData()
  const [archive] = useState(() => (archiveImportedAt() ? null : readBrowserArchive()))
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  if (!isOwner || !userId || (!archive && !done) || hidden) return null

  const run = async () => {
    setBusy(true)
    setError('')
    try {
      const s = await importBrowserData(userId, setProgress)
      setDone(
        `Imported ${s.projects} project${s.projects === 1 ? '' : 's'}, ${s.pages} page${s.pages === 1 ? '' : 's'}, ${
          s.issues
        } issue${s.issues === 1 ? '' : 's'} and ${s.screenshots} screenshot${s.screenshots === 1 ? '' : 's'}.${
          s.missing ? ` ${s.missing} screenshot(s) could not be found in this browser.` : ''
        }`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <section
      aria-labelledby="import-heading"
      className="mt-6 rounded-lg border border-divider border-l-4 border-l-forest bg-surface p-5"
    >
      <h2 id="import-heading" className="m-0 font-serif text-xl">
        {done ? 'Import complete' : 'Import from this browser'}
      </h2>
      <div role="status" aria-live="polite">
        {done ? (
          <p className="m-0 mt-2 text-sm">{done}</p>
        ) : (
          <p className="m-0 mt-2 text-sm text-slate">
            {progress ||
              `This browser has ${archive!.projects.length} project${
                archive!.projects.length === 1 ? '' : 's'
              } saved before sign-in was added. Upload ${
                archive!.projects.length === 1 ? 'it' : 'them'
              }, with pages, issues and screenshots, to your account. Your local copy is kept.`}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="m-0 mt-2 text-sm font-semibold text-danger-text">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {done ? (
          <button type="button" className={button('secondary')} onClick={() => setHidden(true)}>
            Dismiss
          </button>
        ) : (
          <>
            <button type="button" className={button('primary')} onClick={() => void run()} disabled={busy}>
              {busy ? 'Importing…' : 'Import from this browser'}
            </button>
            <button
              type="button"
              className={button('secondary')}
              disabled={busy}
              onClick={() => {
                markArchiveImported()
                setHidden(true)
              }}
            >
              Don't import
            </button>
          </>
        )}
      </div>
    </section>
  )
}
