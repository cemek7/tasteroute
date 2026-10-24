import { describe, expect, it } from 'vitest'
import { mergeEcho } from './echo'

describe('mergeEcho', () => {
  it('keeps an applied constraint that was never relaxed', () => {
    const echo = mergeEcho([{ label: 'Budget', detail: 'nothing above 2' }], [])
    expect(echo.applied).toHaveLength(1)
    expect(echo.ignored).toHaveLength(0)
  })

  it('does not claim a constraint was applied when it was later relaxed', () => {
    const echo = mergeEcho(
      [
        { label: 'Hidden gems', detail: 'below 0.5' },
        { label: 'Budget', detail: 'nothing above 1' },
      ],
      [{ label: 'Hidden gems', reason: 'nothing matched' }],
    )
    expect(echo.applied.map((a) => a.label)).toEqual(['Budget'])
    expect(echo.ignored.map((i) => i.label)).toEqual(['Hidden gems'])
  })

  it('reports an empty applied list when everything was relaxed', () => {
    const echo = mergeEcho(
      [
        { label: 'Hidden gems', detail: 'x' },
        { label: 'Budget', detail: 'y' },
      ],
      [
        { label: 'Hidden gems', reason: 'nothing matched' },
        { label: 'Budget', reason: 'nothing matched' },
      ],
    )
    expect(echo.applied).toEqual([])
    expect(echo.ignored).toHaveLength(2)
  })

  it('does not repeat a label that was relaxed twice', () => {
    const echo = mergeEcho(
      [],
      [
        { label: 'Budget', reason: 'nothing matched' },
        { label: 'Budget', reason: 'nothing matched' },
      ],
    )
    expect(echo.ignored).toHaveLength(1)
  })
})

describe('the two halves of the system use the same labels', () => {
  it('matches every applied label against the relaxation labels', async () => {
    const { constraintsFromIntent } = await import('./qloo-params')
    const { RELAX_LABELS } = await import('./relax')

    // Every constraint that can be relaxed must label itself identically in
    // both places, or mergeEcho cannot tell they are the same thing and the
    // echo reports a constraint as applied and relaxed at once.
    type ConstraintKey = keyof typeof RELAX_LABELS
    const cases: {
      intent: Parameters<typeof constraintsFromIntent>[0]
      key: ConstraintKey
    }[] = [
      { intent: { discovery: 0.9 }, key: 'popularityMax' },
      { intent: { discovery: 0.1 }, key: 'popularityMin' },
      { intent: { budget: 2 }, key: 'priceLevelMax' },
      { intent: { area: { radiusMetres: 1000 } }, key: 'radius' },
      { intent: { requirements: { dietary: ['halal'] } }, key: 'requiredTags' },
    ]

    for (const { intent, key } of cases) {
      const { applied } = constraintsFromIntent(intent)
      expect(applied.map((a) => a.label), key).toContain(RELAX_LABELS[key])
    }
  })

  it('removes a relaxed must-have from the applied list', async () => {
    const { constraintsFromIntent } = await import('./qloo-params')
    const { RELAX_LABELS } = await import('./relax')
    const { applied } = constraintsFromIntent({ requirements: { dietary: ['halal'] } })
    const echo = mergeEcho(applied, [
      { label: RELAX_LABELS.requiredTags, reason: 'nothing matched' },
    ])
    expect(echo.applied).toEqual([])
  })
})
