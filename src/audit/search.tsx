import { Fragment, type ReactNode } from 'react'
import { getWcag } from '../data/wcag'
import type { Issue } from './types'

export type SearchField = { label: string; text: string }

/** Searchable fields of an issue, in the order a match is reported. */
export function issueFields(issue: Issue, componentName = ''): SearchField[] {
  return [
    { label: 'Description', text: issue.description },
    { label: 'Location', text: issue.location },
    { label: 'Component', text: componentName },
    { label: 'Category', text: issue.category },
    {
      label: 'WCAG',
      text: issue.wcag.map((w) => (getWcag(w) ? `${w} ${getWcag(w)!.name}` : w)).join('; '),
    },
    { label: 'Expected behavior', text: issue.expectedBehavior },
    { label: 'How to fix', text: issue.fix },
    { label: 'Auditor notes', text: issue.comments },
  ]
}

/** Fields the issue card already shows in full, so a match there needs no extra context line. */
const SHOWN_ON_CARD = new Set(['Description', 'Location', 'Component', 'WCAG'])

type Token = { kind: 'number'; n: number } | { kind: 'text'; text: string; n?: number }

export type ParsedQuery = { tokens: Token[]; terms: string[] }

/**
 * Words are ANDed. "#12" matches only issue 12; a bare number matches the issue number or any field text
 * (so "12" finds issue #12 and "12px").
 */
export function parseQuery(q: string): ParsedQuery {
  const tokens: Token[] = q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^#\d+$/.test(word)) return { kind: 'number', n: Number(word.slice(1)) }
      const text = word.toLowerCase()
      return /^\d+$/.test(word) ? { kind: 'text', text, n: Number(word) } : { kind: 'text', text }
    })
  const terms = tokens.flatMap((t) => (t.kind === 'text' ? [t.text] : []))
  return { tokens, terms }
}

export type Match = { context: { label: string; text: string }[] }

export function matchIssue(issue: Issue, query: ParsedQuery, componentName = ''): Match | null {
  const fields = issueFields(issue, componentName).map((f) => ({ ...f, lower: f.text.toLowerCase() }))
  for (const t of query.tokens) {
    if (t.kind === 'number') {
      if (issue.number !== t.n) return null
    } else if (issue.number !== t.n && !fields.some((f) => f.lower.includes(t.text))) {
      return null
    }
  }
  const context = fields
    .filter((f) => !SHOWN_ON_CARD.has(f.label) && query.terms.some((t) => f.lower.includes(t)))
    .map((f) => ({ label: f.label, text: snippet(f.text, query.terms) }))
  return { context }
}

/** About `radius` characters either side of the first match, on word boundaries where possible. */
function snippet(text: string, terms: string[], radius = 70) {
  const flat = text.replace(/\s+/g, ' ').trim()
  const lower = flat.toLowerCase()
  const at = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0))
  if (flat.length <= radius * 2) return flat
  let start = Math.max(0, at - radius)
  let end = Math.min(flat.length, at + radius)
  if (start > 0) start = flat.indexOf(' ', start) + 1 || start
  if (end < flat.length) end = flat.lastIndexOf(' ', end) > at ? flat.lastIndexOf(' ', end) : end
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const markClass = 'rounded-sm bg-amber-200 text-[#1f1f1f] dark:bg-amber-300 dark:text-[#1f1f1f]'

/** Wraps each occurrence of a search term in <mark>. */
export function Highlight({ text, terms }: { text: string; terms?: string[] }): ReactNode {
  if (!terms?.length || !text) return text
  const re = new RegExp(
    `(${[...terms]
      .sort((a, b) => b.length - a.length)
      .map(escape)
      .join('|')})`,
    'gi',
  )
  return text.split(re).map((part, i) =>
    i % 2 ? (
      <mark key={i} className={markClass}>
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}
