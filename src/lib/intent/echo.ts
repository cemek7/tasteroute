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
    // Deduped on label AND reason. Deduping on the label alone collapsed two
    // separate requirement drops into one line, which hid from somebody that
    // their dietary need had gone as well as their accessibility one.
    ignored: ignored.filter((i) => {
      const key = `${i.label}\u0000${i.reason}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
  }
}
