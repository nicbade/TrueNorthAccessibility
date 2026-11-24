import { useState } from 'react'
import { imageAlt, useImageUrl } from './issueImages'
import type { Issue, IssueImage } from './types'
import Dialog from './ui/Dialog'
import { button } from './ui/styles'

function ThumbButton({ image, index, onOpen }: { image: IssueImage; index: number; onOpen: () => void }) {
  const url = useImageUrl(image.path)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-20 w-28 cursor-pointer items-center justify-center overflow-hidden rounded border border-slate bg-cream hover:border-forest"
    >
      <span className="sr-only">View larger: </span>
      {url ? (
        <img src={url} alt={imageAlt(image, index)} className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-xs text-slate">Screenshot {index + 1}</span>
      )}
    </button>
  )
}

function Viewer({
  issue,
  index,
  onIndex,
  onClose,
}: {
  issue: Issue
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const image = issue.images[index]
  const url = useImageUrl(image.path)
  const [fit, setFit] = useState(true)
  const count = issue.images.length
  return (
    <Dialog
      size="lg"
      title={`Issue #${issue.number} screenshot ${index + 1} of ${count}`}
      description={`${image.name} · ${image.width}×${image.height}px`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className={button('secondary', 'mr-auto')}
            aria-pressed={!fit}
            onClick={() => setFit((f) => !f)}
          >
            Actual size
          </button>
          {count > 1 && (
            <>
              <button
                type="button"
                className={button('secondary')}
                disabled={index === 0}
                onClick={() => onIndex(index - 1)}
              >
                Previous<span className="sr-only"> screenshot</span>
              </button>
              <button
                type="button"
                className={button('secondary')}
                disabled={index === count - 1}
                onClick={() => onIndex(index + 1)}
              >
                Next<span className="sr-only"> screenshot</span>
              </button>
            </>
          )}
          <button type="button" className={button('primary')} onClick={onClose} data-autofocus>
            Close
          </button>
        </>
      }
    >
      <div
        tabIndex={0}
        role="region"
        aria-label={`Screenshot ${index + 1}, scrollable`}
        className="max-h-[60vh] overflow-auto rounded border border-divider bg-surface"
      >
        {url && (
          <img
            src={url}
            alt={imageAlt(image, index)}
            className={fit ? 'mx-auto block h-auto max-w-full' : 'block max-w-none'}
          />
        )}
      </div>
      <p className="m-0 mt-3 text-sm">
        <span className="font-semibold">Alt text:</span>{' '}
        {image.alt.trim() || (
          <em className="text-slate">None yet. Edit the issue to describe this screenshot.</em>
        )}
      </p>
    </Dialog>
  )
}

export default function IssueImageGallery({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState<number | null>(null)
  if (!issue.images.length) return null
  return (
    <>
      <ul
        aria-label={`Screenshots for issue #${issue.number}`}
        className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0"
      >
        {issue.images.map((img, i) => (
          <li key={img.id}>
            <ThumbButton image={img} index={i} onOpen={() => setOpen(i)} />
          </li>
        ))}
      </ul>
      {open !== null && issue.images[open] && (
        <Viewer issue={issue} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  )
}
