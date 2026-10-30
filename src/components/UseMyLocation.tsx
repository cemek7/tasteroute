'use client'

import { useState } from 'react'
import { coordsSchema, type Coords } from '@/lib/intent/here'

type State = 'idle' | 'asking' | 'got' | 'refused' | 'unsupported' | 'failed'

const MESSAGE: Record<State, string> = {
  idle: '',
  asking: 'asking your browser…',
  got: '',
  refused: 'Location not shared. Searching the whole city instead.',
  unsupported: 'This browser cannot share a location. Searching the whole city.',
  failed: 'Could not get a fix. Searching the whole city instead.',
}

/**
 * A real position beats any centre we could guess for a city, and it is what
 * makes "within 1km" mean within 1km of the person rather than of Qloo's
 * most popular result.
 *
 * Nothing is sent until the person asks, nothing is stored, and every refusal
 * path falls back to searching the whole city rather than blocking.
 */
export function UseMyLocation({
  here,
  onChange,
}: {
  here?: Coords
  onChange: (coords: Coords | undefined) => void
}) {
  const [state, setState] = useState<State>(here ? 'got' : 'idle')

  function ask() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('unsupported')
      return
    }
    setState('asking')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const parsed = coordsSchema.safeParse({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
        if (!parsed.success) {
          setState('failed')
          onChange(undefined)
          return
        }
        setState('got')
        onChange(parsed.data)
      },
      (err) => {
        setState(err.code === err.PERMISSION_DENIED ? 'refused' : 'failed')
        onChange(undefined)
      },
      { timeout: 8000, maximumAge: 300_000 },
    )
  }

  return (
    <div>
      {state === 'got' && here ? (
        <p className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
          <span style={{ color: 'var(--accent)' }}>Using your location</span>
          <button
            type="button"
            onClick={() => {
              setState('idle')
              onChange(undefined)
            }}
            className="underline"
          >
            use the city instead
          </button>
        </p>
      ) : (
        <button
          type="button"
          onClick={ask}
          disabled={state === 'asking'}
          className="text-xs underline disabled:opacity-60"
          style={{ color: 'var(--accent)' }}
        >
          {state === 'asking' ? 'asking your browser…' : 'use my location instead of the city centre'}
        </button>
      )}

      {MESSAGE[state] && state !== 'asking' && (
        <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>
          {MESSAGE[state]}
        </p>
      )}
    </div>
  )
}
