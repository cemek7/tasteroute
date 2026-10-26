'use client'

import { useState } from 'react'
import type { Candidate, Stop } from '@/lib/providers/types'

const SLOT_LABEL: Record<Stop['slot'], string> = {
  morning: 'Morning',
  activity: 'Something to do',
  open: 'Start',
  main: 'Main',
  afternoon: 'Afternoon',
  close: 'Drinks',
  late: 'Late',
}

const EVIDENCE_LABEL: Record<Stop['evidence'][number]['kind'], string> = {
  explainability: 'Qloo explainability',
  tag: 'taste tags',
  affinity: 'affinity score',
  descriptor: 'place details',
  popularity: 'popularity',
}

export function StopCard({
  stop,
  alternatives = [],
  onSwap,
}: {
  stop: Stop
  alternatives?: Candidate[]
  onSwap?: (candidateId: string) => void
}) {
  const [showSwap, setShowSwap] = useState(false)
  const walk = stop.walkFromPrev
  const detail = stop.candidate.detail

  return (
    <li
      className="overflow-hidden rounded-lg border"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
      {stop.candidate.media?.imageUrl && (
        // Fixed height and explicit dimensions: a third-party image that is
        // slow or missing must not shift the layout.
        <img
          src={stop.candidate.media.imageUrl}
          alt=""
          width={420}
          height={144}
          loading="lazy"
          onError={(e) => {
            // Collapse it, do not just hide it: a hidden image still holds
            // its 144px, leaving a blank band above the venue name.
            e.currentTarget.style.display = 'none'
          }}
          className="h-36 w-full object-cover"
          style={{ background: 'var(--border)' }}
        />
      )}
      <div className="p-4">
      {walk && (
        <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
          {walk.minutes} min walk · {walk.metres.toLocaleString()} m
          {walk.minutes > 30 && ' · worth a taxi'}
        </p>
      )}

      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: 'var(--accent)', color: '#0a0a0a' }}
        >
          {SLOT_LABEL[stop.slot]}
        </span>
        <h3 className="text-lg font-semibold">{stop.candidate.name}</h3>
      </div>

      {stop.candidate.address && (
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          {stop.candidate.address}
        </p>
      )}

      {(detail?.neighborhood || detail?.rating != null || detail?.openTonight != null) && (
        <p className="mt-1.5 flex flex-wrap gap-x-2 text-xs" style={{ color: 'var(--muted)' }}>
          {detail?.neighborhood && <span>{detail.neighborhood}</span>}
          {detail?.rating != null && <span>{detail.rating.toFixed(1)} rated</span>}
          {detail?.openTonight === true && <span>open during your window</span>}
          {detail?.openTonight === false && (
            <span style={{ color: '#fca5a5' }}>may be shut then</span>
          )}
        </p>
      )}

      <p className="mt-3 text-sm leading-relaxed">{stop.why}</p>

      {detail?.about && (
        <p className="mt-2 text-xs italic" style={{ color: 'var(--muted)' }}>
          Qloo: &ldquo;{detail.about}&rdquo;
        </p>
      )}

      {stop.evidence.length === 0 ? (
        <p className="mt-2 text-xs italic" style={{ color: 'var(--muted)' }}>
          Qloo returned no taste signal for this place.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {stop.evidence.map((e, i) => (
            <li
              key={`${e.kind}-${i}`}
              className="rounded border px-1.5 py-0.5 text-[10px]"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            >
              {EVIDENCE_LABEL[e.kind]}
            </li>
          ))}
        </ul>
      )}
      {onSwap && alternatives.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowSwap(!showSwap)}
            className="text-xs underline"
            style={{ color: 'var(--muted)' }}
          >
            {showSwap ? 'keep this one' : 'swap this stop'}
          </button>
          {showSwap && (
            <ul className="mt-2 space-y-1">
              {alternatives.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSwap(false)
                      onSwap(c.id)
                    }}
                    className="w-full rounded border px-2 py-1.5 text-left text-xs"
                    style={{ borderColor: 'var(--border)', color: 'var(--fg)' }}
                  >
                    {c.name}
                    {c.detail?.neighborhood ? (
                      <span style={{ color: 'var(--muted)' }}> · {c.detail.neighborhood}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      </div>
    </li>
  )
}
