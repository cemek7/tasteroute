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
      className="rounded-md border px-3 py-2 text-xs"
      style={{ borderColor: '#854d0e', background: '#1c1405', color: '#fde68a' }}
    >
      <strong>Sample data.</strong> This route was built from built-in example places, not a
      live Qloo query.
    </p>
  )
}
