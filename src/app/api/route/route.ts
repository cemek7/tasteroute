import { NextResponse } from 'next/server'
import { createOpenAIClient } from '@/lib/agent/openai-client'
import { planRoute } from '@/lib/agent/loop'
import { SpendLimiter } from '@/lib/agent/spend'
import { hasModelAccess } from '@/lib/env'
import { buildRoute } from '@/lib/route/build'
import { FixtureProvider } from '@/lib/providers/fixture'
import { QlooProvider } from '@/lib/providers/qloo'
import { parseRouteBody } from '@/lib/route/request-body'
import { constraintsFromIntent } from '@/lib/intent/qloo-params'
import { mergeEcho } from '@/lib/intent/echo'

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

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 })
  }

  const parsed = parseRouteBody(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const request = parsed.value
  const locality = { name: request.city }
  // The half of the intent our code enforces. The agent never sees these.
  const { constraints, applied } = constraintsFromIntent(request.intent)

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
      intentEcho: { applied: [], ignored: [] },
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
      constraints,
    })

    if ('error' in result) {
      return NextResponse.json({ error: result.error, trace: result.trace }, { status: 422 })
    }
    return NextResponse.json({
      route: { ...result.route, intentEcho: mergeEcho(applied, result.ignored) },
      roundsUsed: result.roundsUsed,
    })
  } catch (e) {
    // Never leak a stack trace or a key to the client.
    console.error('route planning failed', (e as Error).message)
    return NextResponse.json(
      { error: 'Something went wrong planning that route. Try again.' },
      { status: 500 },
    )
  }
}
