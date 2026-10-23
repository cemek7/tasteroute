'use client'

import { useEffect, useState } from 'react'
import { MoodForm } from '@/components/MoodForm'
import { RouteView } from '@/components/RouteView'
import { SavedRoutes } from '@/components/SavedRoutes'
import { decodeRoute } from '@/lib/share/encode'
import type { Route } from '@/lib/providers/types'

export default function Home() {
  const [route, setRoute] = useState<Route | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [savedVersion, setSavedVersion] = useState(0)

  useEffect(() => {
    const encoded = new URLSearchParams(window.location.search).get('r')
    if (!encoded) return
    const decoded = decodeRoute(encoded)
    if (decoded) setRoute(decoded)
    else setLinkError('That shared link is not readable. Plan a new route instead.')
  }, [])

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">TasteRoute</h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
        Say the mood. Get three stops, in order, with the reason for each one.
      </p>

      {linkError && (
        <p
          className="mt-4 rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: '#7f1d1d', background: '#1c0505', color: '#fca5a5' }}
        >
          {linkError}
        </p>
      )}

      <MoodForm onRoute={setRoute} />
      {route && (
        <RouteView route={route} onSaved={() => setSavedVersion((v) => v + 1)} />
      )}
      <SavedRoutes refreshKey={savedVersion} onOpen={setRoute} />

      <footer className="mt-12 text-xs" style={{ color: 'var(--muted)' }}>
        Built by TechClave. Taste data from Qloo.
      </footer>
    </main>
  )
}
