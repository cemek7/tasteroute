'use client'

import { useEffect, useState } from 'react'
import type { Route } from '@/lib/providers/types'
import { encodeRoute, saveRoute } from '@/lib/share/encode'
import { swapStop } from '@/lib/route/swap'
import { planBudget } from '@/lib/route/budget'
import { scheduleStops } from '@/lib/route/schedule'
import { normaliseWindow } from '@/lib/route/window'
import { IntentEchoPanel } from './IntentEchoPanel'
import { ProviderBanner } from './ProviderBanner'
import { StopCard } from './StopCard'
import { TracePanel } from './TracePanel'

const CONFIDENCE_NOTE: Record<Route['confidence'], string | null> = {
  strong: null,
  ok: 'Choice was thin in places, so one stop may be a stretch.',
  weak: 'Qloo returned little to work with here. Treat this as a guess, and see the other options below.',
}

export function RouteView({
  route: planned,
  onSaved,
}: {
  route: Route
  onSaved?: () => void
}) {
  // Held locally so a swap re-renders without replanning.
  const [route, setRoute] = useState(planned)
  useEffect(() => setRoute(planned), [planned])

  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const note = CONFIDENCE_NOTE[route.confidence]

  // Both are derived, so a swapped stop re-times and re-prices the plan.
  const budget = planBudget(route.stops)
  const schedule = scheduleStops(
    route.stops,
    normaliseWindow(route.narrativeWindow.startHour, route.narrativeWindow.endHour),
  )

  async function copyLink() {
    const url = `${window.location.origin}/plan?r=${encodeRoute(route)}`
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
      <IntentEchoPanel echo={route.intentEcho} />

      {note && (
        <p
          className="mt-3 rounded-md border px-3 py-2 text-xs"
          style={{ borderColor: '#854d0e', background: '#1c1405', color: '#fde68a' }}
        >
          {note}
        </p>
      )}

      {route.narrative.line && (
        <p className="mt-4 max-w-prose text-sm leading-relaxed">{route.narrative.line}</p>
      )}

      {budget && (
        <p className="mt-2 max-w-prose text-xs" style={{ color: 'var(--muted)' }}>
          {budget.line}
        </p>
      )}

      {/* Said once, plainly: these times are arithmetic on the hours and the
          walks, and nothing here is booked. */}
      <p className="mt-1 max-w-prose text-xs" style={{ color: 'var(--muted)' }}>
        Times are an estimate from your hours and the walks between stops. Nothing
        is booked.
      </p>

      {/* The stops stay one chronological column: a grid would read
          left-to-right and break the "walk from the last place" line. The
          width a desktop has spare goes to the panel beside them, which
          follows the stops in the DOM so a phone sees the old page. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <ol className="mt-4 space-y-3">
        {route.stops.map((s, i) => (
          <StopCard
            key={`${s.order}-${s.candidate.id}`}
            stop={s}
            alternatives={route.alternativesBySlot[s.slot]}
            onSwap={(id) => setRoute(swapStop(route, s.slot, id))}
            arrive={schedule[i]?.arrive}
          />
        ))}
      </ol>

      <aside className="lg:sticky lg:top-8 lg:mt-4">
      <div className="mt-6 flex gap-2 lg:mt-0 lg:flex-col">
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
            onSaved?.()
            setTimeout(() => setSaved(false), 2000)
          }}
          className="flex-1 rounded-md border px-3 py-2.5 text-sm"
          style={button}
        >
          {saved ? 'Saved' : 'Save this route'}
        </button>
      </div>

      {route.unfilledSlots.length > 0 && (
        <p
          className="mt-6 rounded-md border px-3 py-2 text-xs"
          style={{ borderColor: '#854d0e', background: '#1c1405', color: '#fde68a' }}
        >
          Nothing Qloo returned fitted the{' '}
          {route.unfilledSlots.map((s) => s.replace(/_/g, ' ')).join(' or ')} part of
          this, so the plan is {route.stops.length} stops rather than the full
          shape of your hours.
        </p>
      )}

      {route.alternatives.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold">
            More places Qloo returned ({route.alternatives.length})
          </h4>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            Beyond the swaps offered on each stop above.
          </p>
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
      </aside>
      </div>

      <TracePanel trace={route.trace} />
    </section>
  )
}
