import { useId, useRef, useState, type FormEvent } from 'react'
import {
  CATEGORIES,
  COMMON_ISSUES,
  EXAMPLE_KINDS,
  PRIORITIES,
  type CommonIssue,
  type ExampleKind,
  type Platform,
  type Priority,
} from '../data/commonIssues'
import { getWcag, parseWcagList } from '../data/wcag'
import CommonIssueSearch from './CommonIssueSearch'
import { STATUSES, type Issue, type IssueDraft, type IssueStatus } from './types'
import Dialog from './ui/Dialog'
import { button, hint, input, label } from './ui/styles'

type Props = {
  issue?: Issue
  platform: Platform
  pageName: string
  onSubmit: (draft: IssueDraft) => void
  onClose: () => void
}

type FormState = Omit<IssueDraft, 'wcag'> & { wcagText: string }

const EMPTY: FormState = {
  description: '',
  expectedBehavior: '',
  fix: '',
  priority: '',
  examples: [],
  wcagText: '',
  category: '',
  comments: '',
  status: 'Open',
  location: '',
  commonIssueId: null,
}

function fromIssue(issue: Issue): FormState {
  const { wcag, ...rest } = issue
  return { ...EMPTY, ...rest, wcagText: wcag.join(', ') }
}

export default function IssueForm({ issue, platform, pageName, onSubmit, onClose }: Props) {
  const id = useId()
  const formId = `${id}-form`
  const [values, setValues] = useState<FormState>(() => (issue ? fromIssue(issue) : EMPTY))
  const [error, setError] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const descRef = useRef<HTMLTextAreaElement>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  const applyCommon = (c: CommonIssue) => {
    setValues((v) => ({
      ...v,
      description: c.description,
      expectedBehavior: c.expectedBehavior,
      fix: c.fix,
      priority: c.priority,
      examples: c.examples.map((e) => ({ ...e })),
      wcagText: c.wcag.join(', '),
      category: c.category,
      comments: c.comments,
      commonIssueId: c.id,
    }))
    setError('')
    setAnnouncement(
      `Filled the form from ${c.platform} common issue ${c.number}. All fields remain editable.`,
    )
  }

  const wcagIds = parseWcagList(values.wcagText)
  const source = values.commonIssueId ? COMMON_ISSUES.find((c) => c.id === values.commonIssueId) : undefined

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!values.description.trim()) {
      setError('Enter a description of the issue.')
      descRef.current?.focus()
      return
    }
    const { wcagText, ...rest } = values
    onSubmit({
      ...rest,
      description: values.description.trim(),
      wcag: parseWcagList(wcagText),
      examples: values.examples.filter((x) => x.label.trim() || x.url.trim()),
    })
  }

  const updateExample = (index: number, patch: Partial<FormState['examples'][number]>) =>
    set(
      'examples',
      values.examples.map((x, i) => (i === index ? { ...x, ...patch } : x)),
    )

  return (
    <Dialog
      size="lg"
      title={issue ? `Edit issue #${issue.number}` : 'Add issue'}
      description={`Page: ${pageName}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={button('secondary')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button('primary')}>
            {issue ? 'Save issue' : 'Add issue'}
          </button>
        </>
      }
    >
      <CommonIssueSearch defaultPlatform={platform} onSelect={applyCommon} />
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <form id={formId} onSubmit={submit} noValidate className="mt-5 grid gap-4 sm:grid-cols-2">
        {source && (
          <p className="m-0 flex flex-wrap items-center gap-2 rounded-md bg-surface px-3 py-2 text-[0.75rem] text-ink sm:col-span-2">
            <span>
              Based on common issue{' '}
              <strong>
                {source.platform} #{source.number}
              </strong>
              .
            </span>
            <button
              type="button"
              className="cursor-pointer font-semibold text-forest underline underline-offset-2"
              onClick={() => set('commonIssueId', null)}
            >
              Unlink
            </button>
          </p>
        )}

        <div className="sm:col-span-2">
          <label htmlFor={`${id}-description`} className={label}>
            Description{' '}
            <span aria-hidden="true" className="text-danger-text">
              *
            </span>
          </label>
          <textarea
            id={`${id}-description`}
            ref={descRef}
            rows={3}
            className={input}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            required
            aria-required="true"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-description-error` : undefined}
          />
          {error && (
            <p
              id={`${id}-description-error`}
              className="m-0 mt-1 text-[0.75rem] font-semibold text-danger-text"
            >
              {error}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={`${id}-expected`} className={label}>
            Expected behavior
          </label>
          <textarea
            id={`${id}-expected`}
            rows={2}
            className={input}
            value={values.expectedBehavior}
            onChange={(e) => set('expectedBehavior', e.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={`${id}-fix`} className={label}>
            Fix
          </label>
          <textarea
            id={`${id}-fix`}
            rows={4}
            className={input}
            value={values.fix}
            onChange={(e) => set('fix', e.target.value)}
          />
        </div>

        <div>
          <label htmlFor={`${id}-priority`} className={label}>
            Priority (severity)
          </label>
          <select
            id={`${id}-priority`}
            className={input}
            value={values.priority}
            onChange={(e) => set('priority', e.target.value as Priority | '')}
          >
            <option value="">Not set</option>
            {PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-status`} className={label}>
            Status
          </label>
          <select
            id={`${id}-status`}
            className={input}
            value={values.status}
            onChange={(e) => set('status', e.target.value as IssueStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-wcag`} className={label}>
            WCAG success criteria
          </label>
          <input
            id={`${id}-wcag`}
            className={input}
            placeholder="e.g. 1.4.3, 4.1.2"
            value={values.wcagText}
            onChange={(e) => set('wcagText', e.target.value)}
            aria-describedby={`${id}-wcag-hint`}
          />
          <div id={`${id}-wcag-hint`} className={hint}>
            {wcagIds.length ? (
              <ul className="m-0 list-none p-0">
                {wcagIds.map((w) => {
                  const c = getWcag(w)
                  return (
                    <li key={w}>
                      <strong>{w}</strong> {c ? `${c.name} (Level ${c.level})` : '— not a WCAG 2.2 criterion'}
                    </li>
                  )
                })}
              </ul>
            ) : (
              'Separate multiple criteria with commas.'
            )}
          </div>
        </div>

        <div>
          <label htmlFor={`${id}-category`} className={label}>
            Category
          </label>
          <input
            id={`${id}-category`}
            className={input}
            list={`${id}-categories`}
            value={values.category}
            onChange={(e) => set('category', e.target.value)}
          />
          <datalist id={`${id}-categories`}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={`${id}-location`} className={label}>
            Location or element
          </label>
          <input
            id={`${id}-location`}
            className={input}
            placeholder="e.g. Header search button, #promo-carousel"
            value={values.location}
            onChange={(e) => set('location', e.target.value)}
          />
        </div>

        <fieldset className="m-0 min-w-0 rounded-lg border border-divider p-4 sm:col-span-2">
          <legend className="px-1 text-[0.8125rem] font-semibold text-ink">
            Working examples and references
          </legend>
          {values.examples.length === 0 && (
            <p className="m-0 mb-3 text-[0.75rem] text-slate">No references added.</p>
          )}
          <ul className="m-0 grid list-none gap-3 p-0">
            {values.examples.map((ex, i) => (
              <li key={i} className="grid items-end gap-2 sm:grid-cols-[8rem_1fr_1fr_auto]">
                <div>
                  <label htmlFor={`${id}-ex-kind-${i}`} className={label}>
                    Type <span className="sr-only">for reference {i + 1}</span>
                  </label>
                  <select
                    id={`${id}-ex-kind-${i}`}
                    className={input}
                    value={ex.kind}
                    onChange={(e) => updateExample(i, { kind: e.target.value as ExampleKind })}
                  >
                    {EXAMPLE_KINDS.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${id}-ex-label-${i}`} className={label}>
                    Label <span className="sr-only">for reference {i + 1}</span>
                  </label>
                  <input
                    id={`${id}-ex-label-${i}`}
                    className={input}
                    value={ex.label}
                    onChange={(e) => updateExample(i, { label: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor={`${id}-ex-url-${i}`} className={label}>
                    URL <span className="sr-only">for reference {i + 1}</span>
                  </label>
                  <input
                    id={`${id}-ex-url-${i}`}
                    type="url"
                    className={input}
                    value={ex.url}
                    onChange={(e) => updateExample(i, { url: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className={button('ghost', 'text-danger-text')}
                  onClick={() =>
                    set(
                      'examples',
                      values.examples.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove<span className="sr-only"> reference {i + 1}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={button('secondary', 'mt-3')}
            onClick={() => set('examples', [...values.examples, { kind: 'External', label: '', url: '' }])}
          >
            Add reference
          </button>
        </fieldset>

        <div className="sm:col-span-2">
          <label htmlFor={`${id}-comments`} className={label}>
            Comments
          </label>
          <textarea
            id={`${id}-comments`}
            rows={2}
            className={input}
            value={values.comments}
            onChange={(e) => set('comments', e.target.value)}
          />
        </div>
      </form>
    </Dialog>
  )
}
