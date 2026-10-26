'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { RouteView } from '@/components/RouteView'
import { decodeRoute } from '@/lib/share/encode'
import { readStashedRoute } from '@/lib/share/session'
import type { Route } from '@/lib/providers/types'

/**
 * A plan gets its own page, so the result is not something you scroll past
 * the form to reach. Two ways in: the person just planned it, and it is in
 * the session; or somebody sent them a link, and it is in `?r=`.
 */
export default function PlanPage() {
  const [route, setRoute] = useState<Route | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'unreadable'>('loading')

  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get('r')
    if (shared) {
      const decoded = decodeRoute(shared)
      setRoute(decoded)
      setState(decoded ? 'ready' : 'unreadable')
      return
    }
    const stashed = readStashedRoute()
    setRoute(stashed)
    setState(stashed ? 'ready' : 'missing')
  }, [])

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 md:max-w-2xl md:px-6 lg:max-w-6xl lg:px-8">
      <Link href="/" className="text-xs underline" style={{ color: 'var(--muted)' }}>
        ← Plan another evening
      </Link>

      {state === 'loading' && (
        <p className="mt-8 text-sm" style={{ color: 'var(--muted)' }}>
          Opening your plan…
        </p>
      )}

      {state === 'unreadable' && (
        <p
          className="mt-8 rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: '#7f1d1d', background: '#1c0505', color: '#fca5a5' }}
        >
          That shared link is not readable. Plan a new one instead.
        </p>
      )}

      {state === 'missing' && (
        <p className="mt-8 text-sm" style={{ color: 'var(--muted)' }}>
          There is no plan open. Start one on the home page.
        </p>
      )}

      {route && <RouteView route={route} />}

      <footer className="mt-12 text-xs" style={{ color: 'var(--muted)' }}>
        Built by TechClave. Taste data from Qloo.
      </footer>
    </main>
  )
}
