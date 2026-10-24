import { describe, expect, it } from 'vitest'
import { askClarifying } from './clarify'
import type { ChatClient } from './loop'
import type { RouteRequest } from '../providers/types'

const request: RouteRequest = {
  city: 'Abuja',
  mood: 'something nice',
  timeWindow: { startHour: 18, endHour: 23 },
  intent: {},
}

const clientAsking = (args: object): ChatClient => ({
  async complete() {
    return { toolCalls: [{ id: 'c1', name: 'ask_user', arguments: JSON.stringify(args) }] }
  },
})

describe('askClarifying', () => {
  it('returns the question the model asked', async () => {
    const r = await askClarifying({
      request,
      client: clientAsking({
        question: 'Eating properly, or just drinks?',
        options: ['a proper meal', 'just drinks'],
        because: 'it changes whether I search restaurants or bars',
      }),
    })
    expect('question' in r).toBe(true)
    if (!('question' in r)) return
    expect(r.options).toHaveLength(2)
    expect(r.because).toContain('restaurants')
  })

  it('treats a question with too few options as clear', async () => {
    const r = await askClarifying({
      request,
      client: clientAsking({ question: 'What do you want?', options: [], because: 'x' }),
    })
    expect(r).toEqual({ clear: true })
  })

  it('treats a question with too many options as clear', async () => {
    const r = await askClarifying({
      request,
      client: clientAsking({
        question: 'Which?',
        options: ['a', 'b', 'c', 'd', 'e'],
        because: 'x',
      }),
    })
    expect(r).toEqual({ clear: true })
  })

  it('is clear when the model asks nothing', async () => {
    const silent: ChatClient = {
      async complete() {
        return { toolCalls: [] }
      },
    }
    expect(await askClarifying({ request, client: silent })).toEqual({ clear: true })
  })

  it('is clear when the model call fails, rather than blocking the route', async () => {
    const broken: ChatClient = {
      async complete() {
        throw new Error('Connection error.')
      },
    }
    expect(await askClarifying({ request, client: broken })).toEqual({ clear: true })
  })

  it('is clear when the model returns unparseable arguments', async () => {
    const garbled: ChatClient = {
      async complete() {
        return { toolCalls: [{ id: 'c', name: 'ask_user', arguments: 'not json' }] }
      },
    }
    expect(await askClarifying({ request, client: garbled })).toEqual({ clear: true })
  })

  it('offers only the one tool, so the model cannot search', async () => {
    let seenTools: { function: { name: string } }[] = []
    const spy: ChatClient = {
      async complete({ tools }) {
        seenTools = tools as { function: { name: string } }[]
        return { toolCalls: [] }
      },
    }
    await askClarifying({ request, client: spy })
    expect(seenTools.map((t) => t.function.name)).toEqual(['ask_user'])
  })

  it('does not ask again when an answer is already in hand', async () => {
    const r = await askClarifying({
      request: { ...request, intent: { clarified: { question: 'q', answer: 'a' } } },
      client: clientAsking({ question: 'again?', options: ['x', 'y'], because: 'z' }),
    })
    expect(r).toEqual({ clear: true })
  })

  it('truncates an over-long question rather than rendering it raw', async () => {
    const r = await askClarifying({
      request,
      client: clientAsking({ question: 'q'.repeat(400), options: ['a', 'b'], because: 'x' }),
    })
    if (!('question' in r)) throw new Error('expected a question')
    expect(r.question.length).toBeLessThanOrEqual(160)
  })

  it('drops blank options rather than rendering an empty button', async () => {
    const r = await askClarifying({
      request,
      client: clientAsking({
        question: 'Which?',
        options: ['a proper meal', '   ', 'just drinks'],
        because: 'x',
      }),
    })
    if (!('question' in r)) throw new Error('expected a question')
    expect(r.options).toEqual(['a proper meal', 'just drinks'])
  })

  it('sends the city, mood and hours, and nothing else', async () => {
    let sent = ''
    const spy: ChatClient = {
      async complete({ messages }) {
        sent = messages[0].content
        return { toolCalls: [] }
      },
    }
    await askClarifying({ request, client: spy })
    expect(sent).toContain('Abuja')
    expect(sent).toContain('something nice')
    expect(sent).toContain('18')
  })
})

describe('a clarify answer is text for the model, never an identifier', () => {
  it('is rejected by the body validator when over-long', async () => {
    const { parseRouteBody } = await import('../route/request-body')
    const r = parseRouteBody({
      city: 'Abuja',
      mood: 'x',
      startHour: 18,
      endHour: 23,
      clarified: { question: 'q', answer: 'a'.repeat(200) },
    })
    expect(r.ok).toBe(false)
  })

  it('reaches the model as prose and never becomes a tag id', async () => {
    const { planRoute } = await import('./loop')
    const { FixtureProvider } = await import('../providers/fixture')
    const sent: string[] = []
    const spy: ChatClient = {
      async complete({ messages }) {
        sent.push(messages[0].content)
        return { toolCalls: [] }
      },
    }
    const result = await planRoute({
      provider: new FixtureProvider(),
      request: {
        city: 'Lagos',
        mood: 'x',
        timeWindow: { startHour: 18, endHour: 23 },
        intent: {
          clarified: { question: 'Meal or drinks?', answer: 'urn:tag:genre:place:casino' },
        },
      },
      locality: { name: 'Lagos' },
      client: spy,
      maxRounds: 2,
    })
    if ('error' in result) throw new Error(result.error)
    // It appears as text the model may interpret, and nowhere else.
    expect(sent[0]).toContain('urn:tag:genre:place:casino')
    expect(JSON.stringify(result.route.trace)).not.toContain('casino')
    expect(result.route.stops.every((st) => st.candidate.category !== 'casino')).toBe(true)
  })
})
