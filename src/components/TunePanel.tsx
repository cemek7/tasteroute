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
        </div>
      )}
    </section>
  )
}
