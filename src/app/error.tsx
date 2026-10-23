'use client'

/**
 * Without this, any render throw replaces the whole page with Next's default
 * "Application error" screen and the person loses everything, including the
 * form. A share link carrying a malformed route is the realistic way in.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight">That did not load</h1>
      <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
        Something in this route could not be displayed. If you arrived from a
        shared link, the link may be damaged.
      </p>
      <div className="mt-6 flex gap-2">
        <button
          onClick={reset}
          className="flex-1 rounded-md px-4 py-3 text-base font-semibold"
          style={{ background: 'var(--accent)', color: '#0a0a0a' }}
        >
          Try again
        </button>
        <a
          href="/"
          className="flex-1 rounded-md border px-4 py-3 text-center text-base"
          style={{ borderColor: 'var(--border)', color: 'var(--fg)' }}
        >
          Start fresh
        </a>
      </div>
    </main>
  )
}
