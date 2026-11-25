import type { ReactNode } from 'react'
import { card, link } from './styles'

type Row = {
  key: string
  label: ReactNode
  count: number
  barClass?: string
  /** Links the label to a list of these issues; `linkId` lets focus return to it. */
  href?: string
  linkId?: string
}

type Props = {
  title: string
  rows: Row[]
  total: number
  labelHeader: string
  emptyText?: string
}

export default function MetricTable({
  title,
  rows,
  total,
  labelHeader,
  emptyText = 'No issues yet.',
}: Props) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <section className={`${card} p-5`} aria-label={title}>
      <h3 className="m-0 mb-3 text-base">{title}</h3>
      {total === 0 || rows.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-slate">{emptyText}</p>
      ) : (
        <table className="w-full border-collapse text-[0.8125rem]">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="text-left text-[0.6875rem] uppercase tracking-wide text-slate">
              <th scope="col" className="pb-1 font-semibold">
                {labelHeader}
              </th>
              <th scope="col" className="w-2/5 pb-1 font-semibold">
                <span className="sr-only">Share</span>
              </th>
              <th scope="col" className="pb-1 text-right font-semibold">
                Issues
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-divider">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
                  {r.href ? (
                    <a
                      href={r.href}
                      aria-label={`${r.key} issues (${r.count})`}
                      data-filter-link={r.linkId}
                      className={`rounded ${link}`}
                    >
                      {r.label}
                    </a>
                  ) : (
                    r.label
                  )}
                </th>
                <td className="py-1.5 pr-3" aria-hidden="true">
                  <div className="h-2 w-full rounded-full bg-cream">
                    <div
                      className={`h-2 rounded-full ${r.barClass ?? 'bg-forest'}`}
                      style={{ width: `${(r.count / max) * 100}%` }}
                    />
                  </div>
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-ink">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
