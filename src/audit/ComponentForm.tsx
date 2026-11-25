import { useId, useState, type FormEvent } from 'react'
import { plural } from './IssueGroups'
import type { ComponentInput } from './store'
import type { Component } from './types'
import type { ConfirmOptions } from './ui/ConfirmDialog'
import Dialog from './ui/Dialog'
import { button, hint, input, label } from './ui/styles'

type Props = {
  component?: Component
  onSubmit: (input: ComponentInput) => Promise<void>
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

export default function ComponentForm({ component, onSubmit, onClose }: Props) {
  const [values, setValues] = useState<ComponentInput>(() => ({
    name: component?.name ?? '',
    description: component?.description ?? '',
  }))
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const id = useId()
  const formId = `${id}-form`

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!values.name.trim()) {
      setError('Enter a component name.')
      document.getElementById(`${id}-name`)?.focus()
      return
    }
    setError('')
    setSaving(true)
    setSaveError('')
    try {
      await onSubmit({ name: values.name.trim(), description: values.description.trim() })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save. Please try again.')
      setSaving(false)
    }
  }

  return (
    <Dialog
      title={component ? 'Edit component' : 'Add component'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={button('secondary')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button('primary')} disabled={saving}>
            {saving ? 'Saving…' : component ? 'Save changes' : 'Add component'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
        {saveError && (
          <p
            role="alert"
            className="m-0 rounded border border-danger-border bg-danger-bg px-3 py-2 text-[0.8125rem] font-semibold text-danger-text"
          >
            {saveError}
          </p>
        )}
        <div>
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
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            required
            aria-required="true"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-name-error` : undefined}
          />
          {error && (
            <p id={`${id}-name-error`} className="m-0 mt-1 text-[0.75rem] font-semibold text-danger-text">
              {error}
            </p>
          )}
        </div>
        <div>
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
      </form>
    </Dialog>
  )
}
