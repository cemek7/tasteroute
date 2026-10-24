'use client'

import { useState } from 'react'
import type { Intent } from '@/lib/providers/types'

/**
 * Collapsed by default, and nothing in it is required. A judge who wants a
 * route in thirty seconds never opens this; anyone who wants the evening to
 * be theirs does.
 */
export function TunePanel({
  intent,
  onChange,
}: {
  intent: Intent
  onChange: (next: Intent) => void
}) {
  const [open, setOpen] = useState(false)
  const discovery = intent.discovery ?? 0.5

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs underline"
        style={{ color: 'var(--muted)' }}
      >
        {open ? 'Hide options' : 'Tune this (optional)'}
      </button>

      {open && (
        <div
          className="mt-3 space-y-4 rounded-md border p-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <label className="block">
            <span
              className="flex justify-between text-[11px] uppercase tracking-wide"
              style={{ color: 'var(--muted)' }}
            >
              <span>The well-known ones</span>
              <span>Hidden gems</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={discovery}
              onChange={(e) => onChange({ ...intent, discovery: Number(e.target.value) })}
              className="mt-2 w-full"
              aria-label="How well known should the places be"
            />
          </label>
          <fieldset>
            <legend className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Budget
            </legend>
            <div className="mt-1 flex gap-1.5">
              {([1, 2, 3, 4] as const).map((b) => {
                const on = intent.budget === b
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => onChange({ ...intent, budget: on ? undefined : b })}
                    className="flex-1 rounded border px-2 py-1.5 text-sm"
                    style={{
                      borderColor: on ? 'var(--accent)' : 'var(--border)',
                      color: on ? 'var(--accent)' : 'var(--fg)',
                    }}
                  >
                    {'\u20a6'.repeat(b)}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Stay within
            </span>
            <select
              value={intent.area?.radiusMetres ?? 0}
              onChange={(e) => {
                const m = Number(e.target.value)
                onChange({ ...intent, area: m === 0 ? null : { radiusMetres: m } })
              }}
              className="mt-1 w-full rounded-md border px-3 py-2 text-base"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
                color: 'var(--fg)',
              }}
            >
              <option value={0}>anywhere in the city</option>
              <option value={1000}>1 km</option>
              <option value={3000}>3 km</option>
              <option value={10000}>10 km</option>
            </select>
          </label>
        </div>
      )}
    </section>
  )
}
