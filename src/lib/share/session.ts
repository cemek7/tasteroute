import { z } from 'zod'
import { routeShape } from './encode'
import type { Route } from '../providers/types'

const KEY = 'tasteroute:plan'

const traceShape = z
  .array(
    z.object({
      at: z.string(),
      tool: z.string(),
      argsSummary: z.string(),
      resultSummary: z.string(),
      ms: z.number(),
    }),
  )
  .default([])

/**
 * The narrowest slice of `sessionStorage` this needs. Taking it as a
 * parameter is what makes the stash testable without a browser, and it is
 * also the honest shape: every one of these calls can throw in private
 * browsing or with site data blocked.
 */
export type Storage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const browserStorage = (): Storage | null => {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * Carries a freshly planned route to its own page.
 *
 * A share link would not do: `encodeRoute` drops the trace, because a
 * thousands-of-characters URL is not a link anybody can send. The person who
 * just planned the route is the one who most wants to see how it was
 * planned, so the full route travels in the session instead.
 */
export function stashRoute(route: Route, storage: Storage | null = browserStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(route))
  } catch {
    // Storage can be blocked. The plan page falls back to the form rather
    // than breaking, which is worse for one person than failing the write.
  }
}

/**
 * Whatever was stashed, if it is still a route. It goes through the same
 * schema a shared link does: session storage is the person's own browser,
 * but it is still input, and a half-written or edited value must render
 * nothing rather than crash the page.
 */
export function readStashedRoute(storage: Storage | null = browserStorage()): Route | null {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    const checked = routeShape.safeParse(parsed)
    if (!checked.success) return null
    // `routeShape` has no `trace` field, because a share link never carries
    // one, so zod strips it. The stash does carry it, so it is validated on
    // its own and put back.
    const trace = traceShape.safeParse((parsed as { trace?: unknown }).trace)
    return { ...checked.data, trace: trace.success ? trace.data : [] } as Route
  } catch {
    return null
  }
}

export function clearStashedRoute(storage: Storage | null = browserStorage()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    // Nothing to do, and nothing worth telling anybody about.
  }
}
