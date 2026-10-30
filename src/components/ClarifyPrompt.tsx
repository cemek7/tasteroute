'use client'

export function ClarifyPrompt({
  question,
  options,
  because,
  onAnswer,
  onSkip,
}: {
  question: string
  options: string[]
  because: string
  onAnswer: (answer: string) => void
  onSkip: () => void
}) {
  return (
    <section
      className="mt-6 rounded-lg border p-4"
      style={{ borderColor: 'var(--accent)', background: 'var(--card)' }}
    >
      <p className="text-sm font-medium">{question}</p>
      {because && (
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          {because}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onAnswer(o)}
            className="rounded-md px-3 py-2 text-sm font-medium"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {o}
          </button>
        ))}
        <button
          type="button"
          onClick={onSkip}
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          just plan it
        </button>
      </div>
    </section>
  )
}
