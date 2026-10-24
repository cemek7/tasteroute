import type { IntentEcho } from '../providers/types'

/**
 * A constraint that was applied and then relaxed is not an applied
 * constraint. Reporting it in both lists reads as nonsense — "Budget applied"
 * directly above "Budget could not be applied" — so the relaxed ones win.
 */
export function mergeEcho(
  applied: IntentEcho['applied'],
  ignored: IntentEcho['ignored'],
): IntentEcho {
  const relaxed = new Set(ignored.map((i) => i.label))
  const seen = new Set<string>()
  return {
    applied: applied.filter((a) => !relaxed.has(a.label)),
    ignored: ignored.filter((i) => {
      if (seen.has(i.label)) return false
      seen.add(i.label)
      return true
    }),
  }
}
