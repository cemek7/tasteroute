import type { Intent } from '../providers/types'

/**
 * One tap that fills in a mood, a pair of hours and the options that go with
 * them. The options panel already asks for all of this, but somebody opening
 * the app for the first time does not yet know that the hours are what decide
 * whether they get breakfast or a club — a preset shows them.
 *
 * Everything here is a starting point: each field stays editable, and the
 * vocabulary is the same one the panel uses, so a preset can never ask Qloo
 * for a tag the app cannot resolve.
 */
export type Preset = {
  id: string
  label: string
  /** What the person would have typed. */
  mood: string
  startHour: number
  endHour: number
  intent: Partial<Intent>
}

export const PRESETS: Preset[] = [
  {
    id: 'date-night',
    label: 'Date night',
    mood: 'quiet, good food, somewhere we can actually talk',
    startHour: 18,
    endHour: 23,
    intent: {
      occasion: 'date_night',
      vibe: ['intimate'],
      party: { size: 2, composition: 'couple' },
    },
  },
  {
    id: 'food-crawl',
    label: 'Food crawl',
    mood: 'small plates and street food, several short stops',
    startHour: 11,
    endHour: 18,
    intent: {
      occasion: 'catching_up',
      vibe: ['casual'],
      party: { size: 4, composition: 'friends' },
    },
  },
  {
    id: 'day-out',
    label: 'A day out',
    mood: 'museums, a long lunch and a slow afternoon',
    startHour: 10,
    endHour: 20,
    intent: {
      vibe: ['outdoor'],
      party: { size: 2, composition: 'friends' },
    },
  },
  {
    id: 'big-night',
    label: 'Big night',
    mood: 'loud music, cocktails and dancing until late',
    startHour: 21,
    endHour: 2,
    intent: {
      occasion: 'celebration',
      vibe: ['lively'],
      party: { size: 4, composition: 'friends' },
    },
  },
]
