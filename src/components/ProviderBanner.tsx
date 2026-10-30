export function ProviderBanner({ kind }: { kind: 'qloo' | 'fixture' }) {
  if (kind === 'qloo') {
    return (
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Live data from Qloo&apos;s Taste AI.
      </p>
    )
  }
  return (
    <p
      className="rounded-md border px-3 py-2 text-xs caveat"
      style={{ borderColor: 'var(--warn-border)', background: 'var(--warn-bg)', color: 'var(--warn)' }}
    >
      <strong>Sample data.</strong> This route was built from built-in example places, not a
      live Qloo query.
    </p>
  )
}
