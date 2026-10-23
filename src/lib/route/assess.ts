import type { Candidate, Confidence, SlotName } from '../providers/types'
import { slotsFor } from './slots'

const SLOTS: SlotName[] = ['open', 'main', 'close']
const MIN_ELIGIBLE = 6
const MIN_MEDIAN_AFFINITY = 0.3
const STRONG_PER_SLOT = 3

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

export function assessSignal(candidates: Candidate[]): {
  confidence: Confidence
  perSlot: Record<SlotName, number>
  medianAffinity: number | null
  reason: string
} {
  const open = candidates.filter((c) => !c.isClosed)
  const perSlot = SLOTS.reduce(
    (acc, slot) => {
      acc[slot] = open.filter((c) => slotsFor(c).includes(slot)).length
      return acc
    },
    { open: 0, main: 0, close: 0 } as Record<SlotName, number>,
  )

  const eligible = open.filter((c) => slotsFor(c).length > 0)
  const medianAffinity = median(
    open.map((c) => c.affinity).filter((a): a is number => a != null),
  )

  const emptySlots = SLOTS.filter((s) => perSlot[s] === 0)
  const thinSlots = SLOTS.filter((s) => perSlot[s] > 0 && perSlot[s] < STRONG_PER_SLOT)

  if (candidates.length === 0) {
    return {
      confidence: 'weak',
      perSlot,
      medianAffinity,
      reason: 'Qloo returned no places for this search.',
    }
  }
  if (emptySlots.length > 0) {
    return {
      confidence: 'weak',
      perSlot,
      medianAffinity,
      reason: `Nothing matched the ${emptySlots.join(' or ')} part of the evening.`,
    }
  }
  if (eligible.length < MIN_ELIGIBLE) {
    return {
      confidence: 'weak',
      perSlot,
      medianAffinity,
      reason: `Only ${eligible.length} usable places came back, which is too few to choose well.`,
    }
  }
  if (medianAffinity != null && medianAffinity < MIN_MEDIAN_AFFINITY) {
    return {
      confidence: 'weak',
      perSlot,
      medianAffinity,
      reason:
        'The taste match across these places is low, so this is a guess rather than a recommendation.',
    }
  }
  if (thinSlots.length > 0) {
    return {
      confidence: 'ok',
      perSlot,
      medianAffinity,
      reason: `Thin choice for the ${thinSlots.join(' and ')} part of the evening.`,
    }
  }
  return {
    confidence: 'strong',
    perSlot,
    medianAffinity,
    reason: 'Good coverage across all three stops.',
  }
}
