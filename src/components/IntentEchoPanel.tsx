import type { IntentEcho } from '@/lib/providers/types'

/**
 * The intake-side counterpart to the trace panel. A person who asked for
 * halal and got a route without it is owed the reason, not a silent
 * substitution.
 */
export function IntentEchoPanel({ echo }: { echo: IntentEcho }) {
  if (echo.applied.length === 0 && echo.ignored.length === 0) return null

  return (
    <section className="mt-3 space-y-1 text-xs">
      {echo.applied.map((a) => (
        <p key={a.label} style={{ color: 'var(--muted)' }}>
          <span style={{ color: 'var(--accent)' }}>{a.label}</span> — {a.detail}
        </p>
      ))}
      {echo.ignored.map((i) => (
        <p
          key={i.label}
          className="rounded border px-2 py-1 caveat"
          style={{ borderColor: 'var(--warn-border)', background: 'var(--warn-bg)', color: 'var(--warn)' }}
        >
          <strong>{i.label} could not be applied</strong> — {i.reason}
        </p>
      ))}
    </section>
  )
}
