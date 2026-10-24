import { NextResponse } from 'next/server'
import { askClarifying } from '@/lib/agent/clarify'
import { createOpenAIClient } from '@/lib/agent/openai-client'
import { SpendLimiter } from '@/lib/agent/spend'
import { hasModelAccess } from '@/lib/env'
import { parseRouteBody } from '@/lib/route/request-body'

export const runtime = 'nodejs'
export const maxDuration = 30

const limiter = new SpendLimiter({
  dailyCeiling: Number(process.env.TASTEROUTE_DAILY_CLARIFY_CEILING ?? 600),
})

/**
 * Separate from /api/route on purpose: planning stays one phase, its contract
 * unchanged, and this whole feature can be removed by deleting one handler
 * and one component.
 *
 * Every failure path returns `{ clear: true }`. A question is a nicety and
 * must never stand between a person and a route.
 */
export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ clear: true })
  }

  const parsed = parseRouteBody(body)
  // A body we cannot read is not worth a question; /api/route will say why.
  if (!parsed.ok) return NextResponse.json({ clear: true })

  if (!hasModelAccess() || !limiter.tryConsume()) {
    return NextResponse.json({ clear: true })
  }

  try {
    return NextResponse.json(
      await askClarifying({ request: parsed.value, client: createOpenAIClient() }),
    )
  } catch (e) {
    console.error('clarify failed', (e as Error).message)
    return NextResponse.json({ clear: true })
  }
}
