import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { PLATFORMS, searchCommonIssues, type CommonIssue, type Platform } from '../data/commonIssues'
import Badge from './ui/Badge'
import { hint, input, label } from './ui/styles'

type Props = {
  defaultPlatform: Platform
  onSelect: (issue: CommonIssue) => void
}

function highlight(text: string, terms: string[]) {
  if (!terms.length) return text
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return text.split(re).map((part, i) =>
    i % 2 ? (
      <mark key={i} className="rounded-sm bg-yellow-200 px-0.5 text-black">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

/** ARIA 1.2 editable combobox with list autocomplete. */
export default function CommonIssueSearch({ defaultPlatform, onSelect }: Props) {
  const id = useId()
  const listId = `${id}-list`
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState<Platform | 'All'>(defaultPlatform)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listRef = useRef<HTMLUListElement>(null)

  const results = useMemo(() => searchCommonIssues(query, platform, 40), [query, platform])
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const expanded = open && results.length > 0

  const choose = (issue: CommonIssue) => {
    onSelect(issue)
    setQuery('')
    setOpen(false)
    setActive(-1)
  }

  const move = (next: number) => {
    setOpen(true)
    setActive(next)
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`#${CSS.escape(`${id}-opt-${next}`)}`)
        ?.scrollIntoView({ block: 'nearest' })
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!results.length) return
        move(!open ? 0 : (active + 1) % results.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!results.length) return
        move(!open || active <= 0 ? results.length - 1 : active - 1)
        break
      case 'Enter':
        if (expanded && active >= 0) {
          e.preventDefault()
          choose(results[active])
        }
        break
      case 'Escape':
        if (open) {
          e.preventDefault()
          e.stopPropagation()
          setOpen(false)
          setActive(-1)
        } else if (query) {
          e.preventDefault()
          e.stopPropagation()
          setQuery('')
        }
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  const status = !open
    ? ''
    : results.length
      ? `${results.length} matching common issue${results.length === 1 ? '' : 's'}. Use up and down arrows to review, Enter to select.`
      : 'No matching common issues.'

  return (
    <div className="rounded-lg border border-divider border-l-4 border-l-forest bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <div className="relative">
          <label htmlFor={`${id}-input`} className={label}>
            Search common issues
          </label>
          <input
            id={`${id}-input`}
            data-autofocus
            type="text"
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={expanded && active >= 0 ? `${id}-opt-${active}` : undefined}
            aria-describedby={`${id}-hint`}
            autoComplete="off"
            spellCheck={false}
            className={input}
            placeholder="Try “alt text”, “focus”, “1.4.3” or “modal”"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
              setActive(-1)
            }}
            onFocus={() => query && setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
          />
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label="Common issues"
            hidden={!expanded}
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 list-none overflow-y-auto rounded-lg border border-divider bg-cream p-1 shadow-xl"
          >
            {results.map((issue, i) => (
              <li
                key={issue.id}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(issue)}
                onMouseMove={() => active !== i && setActive(i)}
                className={`cursor-pointer rounded-md px-3 py-2 text-[0.8125rem] leading-5 ${
                  i === active ? 'bg-surface outline-2 outline-forest' : ''
                }`}
              >
                <span className="block text-ink">{highlight(issue.description, terms)}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-slate">
                  <span className="font-semibold">
                    {issue.platform} #{issue.number}
                  </span>
                  {issue.priority && <Badge kind="priority" value={issue.priority} srPrefix="Priority" />}
                  {issue.category && <span>· {highlight(issue.category, terms)}</span>}
                  {issue.wcag.length > 0 && <span>· WCAG {highlight(issue.wcag.join(', '), terms)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <label htmlFor={`${id}-platform`} className={label}>
            Library
          </label>
          <select
            id={`${id}-platform`}
            className={input}
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform | 'All')}
          >
            <option value="All">All</option>
            {PLATFORMS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>
      <p id={`${id}-hint`} className={`${hint} mb-0`}>
        Searches description, expected behavior, fix, WCAG number and name, category and references. Selecting
        an issue fills in the fields below; you can still edit them.
      </p>
      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>
    </div>
  )
}
