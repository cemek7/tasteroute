import type { IntentEcho } from '../providers/types'

/**
 * The echo for a route built from sample data.
 *
 * Without credentials, or past the daily spend ceiling, the app answers from
 * hand-written fixtures. Those fixtures cannot honour a dietary need, a
 * budget, a radius or an exclusion — so every constraint the person stated is
 * reported as unhonoured, and the route reports weak confidence.
 *
 * The alternative, which this replaces, was to compute the constraints and
 * then quietly discard them while telling the person they had been applied.
 * For somebody who asked for halal that is the worst thing this product
 * could do.
 */
export function degradedEcho(applied: IntentEcho['applied']): IntentEcho {
  return {
    applied: [],
    ignored: applied.map((a) => ({
      label: a.label,
      reason: 'this route came from sample data, which cannot honour it',
    })),
  }
}
