'use client'

import { useState } from 'react'
import type { Route } from '@/lib/providers/types'
import { TimeWindowPicker } from './TimeWindowPicker'

// Suggestions, not limits. Abuja leads because measured against the live Qloo
// catalogue it returns the strongest coverage and the most walkable routes of
// the cities we tried.
const CITIES = ['Abuja', 'Lagos', 'Port Harcourt', 'Nairobi', 'Accra']

const EXAMPLES = [
  'low-key but not dead, somewhere with live music',
  'cocktails and loud music',
  'quiet, good food, early finish',
]

export function MoodForm({ onRoute }: { onRoute: (r: Route) => void }) {
  const [city, setCity] = useState(CITIES[0])
  const [mood, setMood] = useState('')
  const [startHour, setStartHour] = useState(18)
  const [endHour, setEndHour] = useState(23)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ city, mood, startHour, endHour }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong planning that route.')
        return
      }
      onRoute(data.route as Route)
    } catch {
      setError('Could not reach the planner. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const field = {
    borderColor: 'var(--border)',
    background: 'var(--card)',
    color: 'var(--fg)',
  }
  const legend = { color: 'var(--muted)' }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide" style={legend}>
          City
        </span>
        {/* Free text with suggestions, not a closed list: Qloo knows far more
            cities than we can list, and an unknown one already has a clear
            error path. */}
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          list="tasteroute-cities"
          required
          maxLength={80}
          className="mt-1 w-full rounded-md border px-3 py-2.5 text-base"
          style={field}
        />
        <datalist id="tasteroute-cities">
          {CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide" style={legend}>
          What kind of evening?
        </span>
        <input
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          required
          maxLength={200}
          placeholder={EXAMPLES[0]}
          className="mt-1 w-full rounded-md border px-3 py-2.5 text-base"
          style={field}
        />
      </label>

      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setMood(ex)}
            className="rounded-full border px-2.5 py-1 text-[11px]"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            {ex}
          </button>
        ))}
      </div>

      <TimeWindowPicker
        startHour={startHour}
        endHour={endHour}
        onChange={({ startHour: sh, endHour: eh }) => {
          setStartHour(sh)
          setEndHour(eh)
        }}
      />

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md px-4 py-3 text-base font-semibold disabled:opacity-60"
        style={{ background: 'var(--accent)', color: '#0a0a0a' }}
      >
        {busy ? 'Asking Qloo…' : 'Plan my evening'}
      </button>

      {busy && (
        <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
          The planner makes several Qloo calls. This takes up to a minute.
        </p>
      )}

      {error && (
        <p
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: '#7f1d1d', background: '#1c0505', color: '#fca5a5' }}
        >
          {error}
        </p>
      )}
    </form>
  )
}
