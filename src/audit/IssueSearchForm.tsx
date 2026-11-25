import { useId, type RefObject } from 'react'
import { button, input } from './ui/styles'

type Props = {
  projectName: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  inputRef?: RefObject<HTMLInputElement | null>
  className?: string
}

/** Search landmark for the project's issues: on the dashboard it opens the search view, there it filters. */
export default function IssueSearchForm({
  projectName,
  value,
  onChange,
  onSubmit,
  inputRef,
  className,
}: Props) {
  const id = useId()
  return (
    <form
      role="search"
      aria-label={`Issues in ${projectName}`}
      className={className}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <label htmlFor={`${id}-q`} className="block text-[0.875rem] font-semibold">
        Search issues
      </label>
      <div className="mt-1 flex max-w-2xl gap-2">
        <input
          ref={inputRef}
          id={`${id}-q`}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          spellCheck={false}
          className={`${input} min-w-0 flex-1`}
        />
        <button type="submit" className={button('primary')}>
          Search
        </button>
      </div>
      <p id={`${id}-hint`} className="m-0 mt-1 text-[0.75rem] text-slate">
        Searches every page by issue number (#12), description, expected behavior, how to fix, notes,
        location, component, category and WCAG criterion.
      </p>
    </form>
  )
}
