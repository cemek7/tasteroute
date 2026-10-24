'use client'

/**
 * A plain number input was the wrong control here. Clearing it produced
 * `Number('') === 0`, so an empty field silently meant midnight; typing 99
 * passed straight through to a server error, because min/max only bind the
 * spinner arrows; and an evening running 22:00 to 02:00 was rejected outright.
 *
 * Hours are a closed set of 25 values, so a select cannot hold a wrong one.
 */

const HOURS = Array.from({ length: 25 }, (_, h) => h)

function label(hour: number): string {
  if (hour === 0) return 'midnight'
  if (hour === 24) return 'midnight'
  if (hour === 12) return 'noon'
  const suffix = hour < 12 ? 'am' : 'pm'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}${suffix}`
}

export function TimeWindowPicker({
  startHour,
  endHour,
  onChange,
}: {
  startHour: number
  endHour: number
  onChange: (next: { startHour: number; endHour: number }) => void
}) {
  const crossesMidnight = endHour <= startHour
  const field = {
    borderColor: 'var(--border)',
    background: 'var(--card)',
    color: 'var(--fg)',
  }
  const legend = { color: 'var(--muted)' }

  return (
    <div>
      <div className="flex gap-3">
        <label className="flex-1">
          <span className="text-xs font-medium uppercase tracking-wide" style={legend}>
            Out from
          </span>
          <select
            value={startHour}
            onChange={(e) => onChange({ startHour: Number(e.target.value), endHour })}
            className="mt-1 w-full rounded-md border px-3 py-2.5 text-base"
            style={field}
          >
            {HOURS.slice(0, 24).map((h) => (
              <option key={h} value={h}>
                {label(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          <span className="text-xs font-medium uppercase tracking-wide" style={legend}>
            Until
          </span>
          <select
            value={endHour}
            onChange={(e) => onChange({ startHour, endHour: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border px-3 py-2.5 text-base"
            style={field}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {label(h)}
                {h === 24 ? '' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {crossesMidnight && (
        <p className="mt-1.5 text-xs" style={legend}>
          Carries on past midnight — {label(startHour)} tonight until{' '}
          {label(endHour)} tomorrow.
        </p>
      )}
    </div>
  )
}
