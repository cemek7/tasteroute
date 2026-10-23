import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createOpenAIClient } from '@/lib/agent/openai-client'
import { planRoute } from '@/lib/agent/loop'
import { SpendLimiter } from '@/lib/agent/spend'
import { hasModelAccess } from '@/lib/env'
import { buildRoute } from '@/lib/route/build'
import { FixtureProvider } from '@/lib/providers/fixture'
import { QlooProvider } from '@/lib/providers/qloo'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * This endpoint is public and unauthenticated, and the credit behind it is
 * small. Module scope means the counter is per server process: a brake, not a
 * guarantee, but enough that one scripted loop cannot empty the account and
 * take the demo offline mid-judging.
 */
const limiter = new SpendLimiter({
  dailyCeiling: Number(process.env.TASTEROUTE_DAILY_ROUTE_CEILING ?? 400),
})

const bodySchema = z
  .object({
    city: z.string().min(1).max(80),
    mood: z.string().min(1).max(200),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
  })
  .refine((b) => b.endHour > b.startHour, {
    message: 'The end of the evening has to come after the start.',
  })

export async function POST(req: Request) {
  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await req.json())
  } catch (e) {
    const message =
      e instanceof z.ZodError
        ? (e.issues[0]?.message ?? 'Tell us a city and a mood to work from.')
        : 'Tell us a city and a mood to work from.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const request = {
    city: parsed.city,
    mood: parsed.mood,
    timeWindow: { startHour: parsed.startHour, endHour: parsed.endHour },
  }
  const locality = { name: parsed.city }

  // Without credentials, or past the daily ceiling, we still answer — from
  // clearly labelled sample data rather than with an error page.
  const budgetLeft = limiter.tryConsume()
  const useFixtures = !hasModelAccess() || !process.env.QLOO_API_KEY || !budgetLeft
  if (useFixtures) {
    const provider = new FixtureProvider()
    const { candidates } = await provider.suggestPlaces({ locality: locality.name })
    const built = buildRoute({
      candidates,
      request,
      locality,
      requestedTagIds: [],
      explainability: null,
      seedNames: {},
      trace: [],
      providerKind: 'fixture',
    })
    if ('error' in built) return NextResponse.json({ error: built.reason }, { status: 422 })
    return NextResponse.json({
      route: built,
      ...(budgetLeft ? {} : { notice: 'Daily planning limit reached. Showing a sample route.' }),
    })
  }

  try {
    const result = await planRoute({
      provider: new QlooProvider(),
      request,
      locality,
      client: createOpenAIClient(),
    })

    if ('error' in result) {
      return NextResponse.json({ error: result.error, trace: result.trace }, { status: 422 })
    }
    return NextResponse.json({ route: result.route, roundsUsed: result.roundsUsed })
  } catch (e) {
    // Never leak a stack trace or a key to the client.
    console.error('route planning failed', (e as Error).message)
    return NextResponse.json(
      { error: 'Something went wrong planning that route. Try again.' },
      { status: 500 },
    )
  }
}
