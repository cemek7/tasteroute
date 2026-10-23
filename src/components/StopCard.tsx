import type { Stop } from '@/lib/providers/types'

const SLOT_LABEL: Record<Stop['slot'], string> = {
  open: 'Start',
  main: 'Main',
  close: 'Finish',
}

const EVIDENCE_LABEL: Record<Stop['evidence'][number]['kind'], string> = {
  explainability: 'Qloo explainability',
  tag: 'taste tags',
  affinity: 'affinity score',
  descriptor: 'place details',
  popularity: 'popularity',
}

export function StopCard({ stop }: { stop: Stop }) {
  const walk = stop.walkFromPrev

  return (
    <li
      className="rounded-lg border p-4"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
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

      <p className="mt-3 text-sm leading-relaxed">{stop.why}</p>

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
    </li>
  )
}
