'use client'

import { useState } from 'react'

/**
 * A free-text list: type, press enter, it becomes a chip. Used for places you
 * already like and for things to avoid — both of which parse, validate and
 * reach Qloo, and neither of which had any way to be entered.
 */
export function ChipListInput({
  legend,
  placeholder,
  values,
  max,
  onChange,
}: {
  legend: string
  placeholder: string
  values: string[]
  max: number
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const term = draft.trim()
    if (!term || values.includes(term) || values.length >= max) {
      setDraft('')
      return
    }
    onChange([...values, term])
    setDraft('')
  }

  return (
    <fieldset>
      <legend className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
        {legend}
      </legend>
      {values.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <li key={v}>
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="rounded-full border px-2.5 py-1 text-xs"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                aria-label={`remove ${v}`}
              >
                {v} ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {values.length < max && (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
          placeholder={placeholder}
          maxLength={60}
          className="mt-1 w-full rounded-md border px-3 py-2 text-base"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card)',
            color: 'var(--fg)',
          }}
        />
      )}
    </fieldset>
  )
}
