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
