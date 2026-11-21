import { useId, useState, type FormEvent } from 'react'
import { PLATFORMS, type Platform } from '../data/commonIssues'
import type { ProjectInput } from './store'
import type { Project } from './types'
import Dialog from './ui/Dialog'
import { button, hint, input, label } from './ui/styles'

type Props = {
  project?: Project
  onSubmit: (input: ProjectInput) => void
  onClose: () => void
}

const DEFAULTS: ProjectInput = {
  name: '',
  client: '',
  url: '',
  platform: 'Desktop',
  standard: 'WCAG 2.2 AA',
  auditor: 'Nicholas Bade',
  startDate: new Date().toISOString().slice(0, 10),
  notes: '',
}

export default function ProjectForm({ project, onSubmit, onClose }: Props) {
  const [values, setValues] = useState<ProjectInput>(() => (project ? { ...project } : DEFAULTS))
  const [error, setError] = useState('')
  const id = useId()
  const formId = `${id}-form`

  const set = <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!values.name.trim()) {
      setError('Enter a project name.')
      document.getElementById(`${id}-name`)?.focus()
      return
    }
    onSubmit({ ...values, name: values.name.trim() })
  }

  return (
    <Dialog
      title={project ? 'Edit project' : 'New audit project'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={button('secondary')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button('primary')}>
            {project ? 'Save changes' : 'Create project'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-name`} className={label}>
            Project name{' '}
            <span aria-hidden="true" className="text-danger-text">
              *
            </span>
          </label>
          <input
            id={`${id}-name`}
            data-autofocus
            className={input}
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
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
          <label htmlFor={`${id}-client`} className={label}>
            Client
          </label>
          <input
            id={`${id}-client`}
            className={input}
            value={values.client}
            onChange={(e) => set('client', e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-url`} className={label}>
            Site or app URL
          </label>
          <input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            placeholder="https://example.com"
            className={input}
            value={values.url}
            onChange={(e) => set('url', e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-platform`} className={label}>
            Platform
          </label>
          <select
            id={`${id}-platform`}
            className={input}
            value={values.platform}
            onChange={(e) => set('platform', e.target.value as Platform)}
            aria-describedby={`${id}-platform-hint`}
          >
            {PLATFORMS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <p id={`${id}-platform-hint`} className={hint}>
            Sets the default common issue library for this project.
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-standard`} className={label}>
            Conformance target
          </label>
          <input
            id={`${id}-standard`}
            className={input}
            value={values.standard}
            onChange={(e) => set('standard', e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-auditor`} className={label}>
            Auditor
          </label>
          <input
            id={`${id}-auditor`}
            className={input}
            value={values.auditor}
            onChange={(e) => set('auditor', e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-date`} className={label}>
            Audit start date
          </label>
          <input
            id={`${id}-date`}
            type="date"
            className={input}
            value={values.startDate}
            onChange={(e) => set('startDate', e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-notes`} className={label}>
            Notes
          </label>
          <textarea
            id={`${id}-notes`}
            rows={3}
            className={input}
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>
      </form>
    </Dialog>
  )
}
