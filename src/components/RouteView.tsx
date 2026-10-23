'use client'

import { useState } from 'react'
import type { Route } from '@/lib/providers/types'
import { encodeRoute, saveRoute } from '@/lib/share/encode'
import { ProviderBanner } from './ProviderBanner'
import { StopCard } from './StopCard'
import { TracePanel } from './TracePanel'

const CONFIDENCE_NOTE: Record<Route['confidence'], string | null> = {
  strong: null,
  ok: 'Choice was thin in places, so one stop may be a stretch.',
  weak: 'Qloo returned little to work with here. Treat this as a guess, and see the other options below.',
}

export function RouteView({ route }: { route: Route }) {
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const note = CONFIDENCE_NOTE[route.confidence]

  async function copyLink() {
    const url = `${window.location.origin}/?r=${encodeRoute(route)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused. Fall back to showing the link so the
      // person can copy it themselves rather than getting silence.
      window.prompt('Copy this link', url)
    }
  }

  const button = {
    borderColor: 'var(--border)',
    background: 'var(--card)',
    color: 'var(--fg)',
  }

  return (
    <section className="mt-8">
      <ProviderBanner kind={route.providerKind} />

      {note && (
        <p
          className="mt-3 rounded-md border px-3 py-2 text-xs"
          style={{ borderColor: '#854d0e', background: '#1c1405', color: '#fde68a' }}
        >
          {note}
        </p>
      )}

      <ol className="mt-4 space-y-3">
        {route.stops.map((s) => (
          <StopCard key={`${s.order}-${s.candidate.id}`} stop={s} />
        ))}
      </ol>

      <div className="mt-6 flex gap-2">
        <button
          onClick={copyLink}
          className="flex-1 rounded-md border px-3 py-2.5 text-sm"
          style={button}
        >
          {copied ? 'Link copied' : 'Copy share link'}
        </button>
        <button
          onClick={() => {
            saveRoute(route)
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
          }}
          className="flex-1 rounded-md border px-3 py-2.5 text-sm"
          style={button}
        >
          {saved ? 'Saved' : 'Save this route'}
        </button>
      </div>

      {route.alternatives.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold">Other places Qloo returned</h4>
          <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--muted)' }}>
            {route.alternatives.map((c) => (
              <li key={c.id}>
                {c.name}
                {c.category ? ` — ${c.category.replace(/_/g, ' ')}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <TracePanel trace={route.trace} />
    </section>
  )
}
