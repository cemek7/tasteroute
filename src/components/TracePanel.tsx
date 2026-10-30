'use client'

import { useState } from 'react'
import type { TraceEntry } from '@/lib/providers/types'

export function TracePanel({ trace }: { trace: TraceEntry[] }) {
  const [open, setOpen] = useState(false)
  if (trace.length === 0) return null

  return (
    <section className="mt-8">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs underline"
        style={{ color: 'var(--accent)' }}
      >
        {open ? 'Hide' : 'Show'} how this was planned ({trace.length} steps)
      </button>

      {open && (
        <ol className="mt-3 space-y-2">
          {trace.map((t, i) => (
            <li
              key={`${t.tool}-${i}`}
              className="rounded border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
            >
              <div className="flex justify-between gap-3">
                <code style={{ color: 'var(--accent)' }}>{t.tool}</code>
                <span style={{ color: 'var(--muted)' }}>{t.ms} ms</span>
              </div>
              <p className="mt-1 break-words" style={{ color: 'var(--muted)' }}>
                {t.resultSummary}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
