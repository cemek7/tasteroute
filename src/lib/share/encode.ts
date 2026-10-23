import { z } from 'zod'
import type { Route } from '../providers/types'

const STORAGE_KEY = 'tasteroute.saved.v1'

const stopShape = z.object({
  order: z.number(),
  slot: z.enum(['open', 'main', 'close']),
  candidate: z.object({ id: z.string(), name: z.string() }).loose(),
  why: z.string(),
  evidence: z.array(z.object({ kind: z.string(), label: z.string() }).loose()),
})

/**
 * A share link is user-editable, so the payload is validated like any other
 * untrusted input. This is what turns a tampered `?r=` into a clean null
 * rather than a blank page.
 */
const routeShape = z.object({
  id: z.string(),
  locality: z.object({ name: z.string() }).loose(),
  mood: z.string(),
  createdAt: z.string(),
  stops: z.tuple([stopShape, stopShape, stopShape]),
  confidence: z.enum(['strong', 'ok', 'weak']),
  providerKind: z.enum(['qloo', 'fixture']),
})

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const b64 =
    typeof btoa === 'function' ? btoa(binary) : Buffer.from(json, 'utf8').toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    if (typeof atob === 'function') {
      const binary = atob(padded)
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    }
    return Buffer.from(padded, 'base64').toString('utf8')
  } catch {
    return null
  }
}

export function encodeRoute(route: Route): string {
  // The trace can run to thousands of characters and is not part of what gets
  // shared: the link carries the evening, not how it was planned.
  const { trace: _trace, ...rest } = route
  return toBase64Url(JSON.stringify({ ...rest, trace: [] }))
}

export function decodeRoute(encoded: string): Route | null {
  if (!encoded) return null
  const json = fromBase64Url(encoded)
  if (!json) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }

  if (!routeShape.safeParse(parsed).success) return null

  const route = parsed as Route
  return {
    ...route,
    trace: [],
    alternatives: route.alternatives ?? [],
    unfilledSlots: route.unfilledSlots ?? [],
  }
}

export function saveRoute(route: Route): void {
  try {
    const existing = listSavedRoutes().filter((r) => r.id !== route.id)
    const next = [{ ...route, trace: [] }, ...existing].slice(0, 20)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private browsing or blocked storage. Saving is a convenience, not a
    // requirement, so a failure here must not break the page.
  }
}

export function listSavedRoutes(): Route[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Route[]) : []
  } catch {
    return []
  }
}
