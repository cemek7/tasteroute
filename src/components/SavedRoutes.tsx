'use client'

import { useEffect, useState } from 'react'
import type { Route } from '@/lib/providers/types'
import { listSavedRoutes } from '@/lib/share/encode'

/**
 * Without this, "Save this route" wrote to a drawer with no handle: the route
 * went into localStorage and nothing could ever list it again.
 */
export function SavedRoutes({
  onOpen,
  refreshKey,
}: {
  onOpen: (r: Route) => void
  refreshKey: number
}) {
  const [saved, setSaved] = useState<Route[]>([])

  useEffect(() => {
    setSaved(listSavedRoutes())
  }, [refreshKey])

  if (saved.length === 0) return null

  return (
    <section className="mt-10">
      <h4 className="text-sm font-semibold">Saved routes</h4>
      <ul className="mt-2 space-y-2">
        {saved.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => onOpen(r)}
              className="w-full rounded-md border px-3 py-2 text-left text-xs"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
            >
              <span className="block font-medium" style={{ color: 'var(--fg)' }}>
                {r.locality.name} — {r.mood || 'no mood given'}
              </span>
              <span style={{ color: 'var(--muted)' }}>
                {r.stops.map((s) => s.candidate.name).join(' → ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
