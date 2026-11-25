import { useId, useRef, useState, type DragEvent } from 'react'
import { imageFilesFrom, toIssueImage, useImageUrl } from './issueImages'
import type { IssueImage } from './types'
import { button, hint, input, label } from './ui/styles'

type Props = {
  images: IssueImage[]
  pending: Map<string, Blob>
  onChange: (images: IssueImage[]) => void
  onAnnounce: (message: string) => void
  legend?: string
  /** What the images are saved with, e.g. "the issue". */
  saveWith?: string
  /** Every screenshot needs alt text (component screenshots). */
  altRequired?: boolean
  /** Screenshots whose missing alt text should be flagged. */
  invalidIds?: string[]
}

function Thumb({ image, blob }: { image: IssueImage; blob?: Blob }) {
  const url = useImageUrl(image.path, blob)
  return (
    <div className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded border border-divider bg-cream">
      {url ? (
        <img src={url} alt="" className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-xs text-slate">Loading…</span>
      )}
    </div>
  )
}

export async function addFiles(
  files: File[],
  images: IssueImage[],
  pending: Map<string, Blob>,
): Promise<{ images: IssueImage[]; added: IssueImage[]; skipped: number }> {
  const added: IssueImage[] = []
  let skipped = 0
  for (const file of files) {
    try {
      const { meta, blob } = await toIssueImage(file)
      pending.set(meta.id, blob)
      added.push(meta)
    } catch {
      skipped++
    }
  }
  return { images: [...images, ...added], added, skipped }
}

export default function IssueImagesField({
  images,
  pending,
  onChange,
  onAnnounce,
  legend = 'Issue screenshots',
  saveWith = 'the issue',
  altRequired = false,
  invalidIds = [],
}: Props) {
  const id = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  const add = async (files: File[]) => {
    setError('')
    if (!files.length) {
      setError('Choose an image file (PNG, JPEG, WebP or GIF).')
      return
    }
    const result = await addFiles(files, images, pending)
    onChange(result.images)
    if (result.skipped) setError(`${result.skipped} file(s) could not be read as images.`)
    if (result.added.length)
      onAnnounce(
        `${result.added.length} screenshot${result.added.length === 1 ? '' : 's'} added. Add alt text describing ${
          result.added.length === 1 ? 'it' : 'each one'
        }.`,
      )
    if (fileRef.current) fileRef.current.value = ''
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void add(imageFilesFrom(e.dataTransfer.files))
  }

  const update = (index: number, alt: string) =>
    onChange(images.map((img, i) => (i === index ? { ...img, alt } : img)))

  const remove = (index: number) => {
    const img = images[index]
    pending.delete(img.id)
    onChange(images.filter((_, i) => i !== index))
    onAnnounce(`Screenshot ${index + 1} removed.`)
    requestAnimationFrame(() => document.getElementById(`${id}-add`)?.focus())
  }

  return (
    <fieldset className="m-0 min-w-0 rounded-lg border border-divider p-4 sm:col-span-2">
      <legend className="px-1 text-[0.8125rem] font-semibold text-ink">{legend}</legend>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-testid="issue-image-dropzone"
        className={`flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed p-4 ${
          dragging ? 'border-forest bg-surface' : 'border-divider bg-cream'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => void add(imageFilesFrom(e.target.files))}
        />
        <button
          id={`${id}-add`}
          type="button"
          className={button('secondary')}
          aria-describedby={`${id}-hint`}
          onClick={() => fileRef.current?.click()}
        >
          <span aria-hidden="true">+</span> Add screenshots
        </button>
        <p id={`${id}-hint`} className={`${hint} m-0 flex-1`}>
          Drag and drop images here, or paste from the clipboard (Ctrl+V or ⌘V) while focus is in this form.
          Images are stored privately in Supabase when you save {saveWith}.
          {altRequired && ' Each screenshot needs alt text.'}
        </p>
      </div>
      {error && (
        <p role="alert" className="m-0 mt-2 text-xs font-semibold text-danger-text">
          {error}
        </p>
      )}
      {images.length > 0 && (
        <ul className="m-0 mt-3 grid list-none gap-3 p-0">
          {images.map((img, i) => {
            const invalid = invalidIds.includes(img.id)
            return (
              <li
                key={img.id}
                className="flex flex-wrap items-start gap-3 rounded-lg border border-divider bg-surface p-3"
              >
                <Thumb image={img} blob={pending.get(img.id)} />
                <div className="min-w-48 flex-1">
                  <label htmlFor={`${id}-alt-${img.id}`} className={label}>
                    Alt text <span className="sr-only">for screenshot {i + 1}</span>
                    {altRequired && (
                      <>
                        {' '}
                        <span aria-hidden="true" className="text-danger-text">
                          *
                        </span>
                      </>
                    )}
                  </label>
                  <input
                    id={`${id}-alt-${img.id}`}
                    data-image-alt={img.id}
                    className={input}
                    value={img.alt}
                    placeholder="Describe what the screenshot shows"
                    onChange={(e) => update(i, e.target.value)}
                    required={altRequired || undefined}
                    aria-required={altRequired || undefined}
                    aria-invalid={invalid || undefined}
                    aria-describedby={`${invalid ? `${id}-alt-error-${img.id} ` : ''}${id}-meta-${img.id}`}
                  />
                  {invalid && (
                    <p
                      id={`${id}-alt-error-${img.id}`}
                      className="m-0 mt-1 text-[0.75rem] font-semibold text-danger-text"
                    >
                      Describe screenshot {i + 1}.
                    </p>
                  )}
                  <p id={`${id}-meta-${img.id}`} className={`${hint} break-all`}>
                    Screenshot {i + 1}: {img.name} · {img.width}×{img.height}px
                  </p>
                </div>
                <button
                  type="button"
                  className={button('ghost', 'text-danger-text')}
                  onClick={() => remove(i)}
                >
                  Remove<span className="sr-only"> screenshot {i + 1}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </fieldset>
  )
}
