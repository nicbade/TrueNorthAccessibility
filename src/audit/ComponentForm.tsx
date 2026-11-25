import { useId, useRef, useState, type ClipboardEvent, type FormEvent } from 'react'
import IssueImagesField, { addFiles } from './IssueImagesField'
import { imageFilesFrom } from './issueImages'
import { plural } from './IssueGroups'
import { DuplicateComponentNameError, type ComponentInput } from './store'
import type { Component, IssueImage } from './types'
import type { ConfirmOptions } from './ui/ConfirmDialog'
import Dialog from './ui/Dialog'
import { button, hint, input, label } from './ui/styles'

type Props = {
  component?: Component
  /** Shown under the title, e.g. what happens to the new component. */
  description?: string
  /** "screenshots" edits only the screenshots of an existing component. */
  mode?: 'all' | 'screenshots'
  onSubmit: (input: ComponentInput, images: IssueImage[], pending: Map<string, Blob>) => Promise<void>
  onClose: () => void
}

/** Confirmation for deleting a component: its issues are detached, not deleted. */
export function deleteComponentConfirm(component: Component, attached: number): ConfirmOptions {
  return {
    title: `Delete component "${component.name}"?`,
    message:
      attached === 0
        ? `"${component.name}" has no attached issues.`
        : `${plural(attached, 'attached issue')} will be detached from "${component.name}". The issues themselves are kept.`,
    confirmLabel: 'Delete component',
    detail: 'This cannot be undone.',
  }
}

export default function ComponentForm({ component, description, mode = 'all', onSubmit, onClose }: Props) {
  const [values, setValues] = useState<ComponentInput>(() => ({
    name: component?.name ?? '',
    description: component?.description ?? '',
  }))
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [images, setImages] = useState<IssueImage[]>(() => component?.images ?? [])
  const [missingAlt, setMissingAlt] = useState<string[]>([])
  const [announcement, setAnnouncement] = useState('')
  const pending = useRef(new Map<string, Blob>()).current
  const id = useId()
  const formId = `${id}-form`
  const screenshotsOnly = mode === 'screenshots' && component

  const changeImages = (next: IssueImage[]) => {
    setImages(next)
    setMissingAlt((ids) => ids.filter((m) => next.some((img) => img.id === m && !img.alt.trim())))
  }

  // Keeps a paste inside this dialog from also reaching an issue form underneath it.
  const onPaste = async (e: ClipboardEvent) => {
    e.stopPropagation()
    const files = imageFilesFrom(e.clipboardData.items)
    if (!files.length) return
    e.preventDefault()
    const result = await addFiles(files, images, pending)
    changeImages(result.images)
    setAnnouncement(
      `${result.added.length} pasted screenshot${result.added.length === 1 ? '' : 's'} added. Add alt text describing ${
        result.added.length === 1 ? 'it' : 'each one'
      }.`,
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!values.name.trim()) {
      setError('Enter a component name.')
      document.getElementById(`${id}-name`)?.focus()
      return
    }
    setError('')
    const undescribed = images.filter((img) => !img.alt.trim()).map((img) => img.id)
    setMissingAlt(undescribed)
    if (undescribed.length) {
      setAnnouncement('')
      document.querySelector<HTMLElement>(`[data-image-alt="${undescribed[0]}"]`)?.focus()
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      await onSubmit(
        { name: values.name.trim(), description: values.description.trim() },
        images.map((img) => ({ ...img, alt: img.alt.trim() })),
        pending,
      )
    } catch (err) {
      setSaving(false)
      if (err instanceof DuplicateComponentNameError) {
        setError(`This project already has a component named "${values.name.trim()}". Choose another name.`)
        document.getElementById(`${id}-name`)?.focus()
        return
      }
      setSaveError(err instanceof Error ? err.message : 'Could not save. Please try again.')
    }
  }

  return (
    <Dialog
      title={
        screenshotsOnly ? `Screenshots of ${component.name}` : component ? 'Edit component' : 'Add component'
      }
      description={description}
      onClose={onClose}
      onPaste={(e) => void onPaste(e)}
      footer={
        <>
          <button type="button" className={button('secondary')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button('primary')} disabled={saving}>
            {saving
              ? 'Saving…'
              : screenshotsOnly
                ? 'Save screenshots'
                : component
                  ? 'Save changes'
                  : 'Add component'}
          </button>
        </>
      }
    >
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
        {saveError && (
          <p
            role="alert"
            className="m-0 rounded border border-danger-border bg-danger-bg px-3 py-2 text-[0.8125rem] font-semibold text-danger-text"
          >
            {saveError}
          </p>
        )}
        <div hidden={!!screenshotsOnly}>
          <label htmlFor={`${id}-name`} className={label}>
            Component name{' '}
            <span aria-hidden="true" className="text-danger-text">
              *
            </span>
          </label>
          <input
            id={`${id}-name`}
            data-autofocus
            className={input}
            placeholder="e.g. Site header, Cart drawer, Date picker"
            maxLength={200}
            value={values.name}
            onChange={(e) => {
              setValues((v) => ({ ...v, name: e.target.value }))
              if (error) setError('')
            }}
            required
            aria-required="true"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-name-error` : undefined}
          />
          {error && (
            <p
              id={`${id}-name-error`}
              role="alert"
              className="m-0 mt-1 text-[0.75rem] font-semibold text-danger-text"
            >
              {error}
            </p>
          )}
        </div>
        <div hidden={!!screenshotsOnly}>
          <label htmlFor={`${id}-description`} className={label}>
            Description
          </label>
          <textarea
            id={`${id}-description`}
            rows={3}
            className={input}
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            aria-describedby={`${id}-description-hint`}
          />
          <p id={`${id}-description-hint`} className={`m-0 ${hint}`}>
            Optional. Where the component appears and what it contains, so clients can recognise it.
          </p>
        </div>
        <IssueImagesField
          images={images}
          pending={pending}
          onChange={changeImages}
          onAnnounce={setAnnouncement}
          legend="Component screenshots"
          saveWith="the component"
          altRequired
          invalidIds={missingAlt}
        />
      </form>
    </Dialog>
  )
}
