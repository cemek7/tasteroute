import { z } from 'zod'
import type { Route } from '../providers/types'

const STORAGE_KEY = 'tasteroute.saved.v1'

const evidenceShape = z.object({
  kind: z.enum(['explainability', 'tag', 'affinity', 'descriptor', 'popularity']),
  label: z.string(),
  value: z.union([z.string(), z.number()]).optional(),
  source: z.literal('qloo'),
})

/**
 * Everything the UI reads off a candidate. A share link is user-editable, so
 * a field the schema does not describe is a field that reaches React
 * unchecked — which is how an object in `address` blanked the page.
 */
const candidateShape = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable().default(null),
  primaryGenre: z.string().nullable().default(null),
  lat: z.number().nullable().default(null),
  lng: z.number().nullable().default(null),
  address: z.string().nullable().default(null),
  affinity: z.number().nullable().default(null),
  popularity: z.number().nullable().default(null),
  isClosed: z.boolean().nullable().default(null),
  hours: z.unknown().default(null),
  tags: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        popularity: z.number().default(0),
      }),
    )
    .default([]),
  descriptors: z
    .object({
      goodFor: z.string().optional(),
      ambience: z.string().optional(),
      cuisine: z.string().optional(),
      cost: z.string().optional(),
      liveMusic: z.string().optional(),
      rating: z.number().optional(),
    })
    .default({}),
  providerRank: z.number().default(1),
  media: z
    .object({ imageUrl: z.string().optional(), imageUrls: z.array(z.string()).optional() })
    .optional(),
  detail: z
    .object({
      neighborhood: z.string().optional(),
      neighborhoodNote: z.string().optional(),
      about: z.string().optional(),
      standout: z.string().optional(),
      rating: z.number().optional(),
      phone: z.string().optional(),
      website: z.string().optional(),
      openTonight: z.boolean().nullable().optional(),
    })
    .optional(),
  providerRef: z.object({
    provider: z.enum(['qloo', 'fixture']),
    entityId: z.string(),
  }),
})

const stopShape = z.object({
  order: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  slot: z.enum(['open', 'main', 'close']),
  candidate: candidateShape,
  why: z.string(),
  evidence: z.array(evidenceShape),
  walkFromPrev: z
    .object({ metres: z.number(), minutes: z.number() })
    .optional(),
})

const routeShape = z.object({
  id: z.string(),
  locality: z.object({
    name: z.string(),
    qlooLocalityId: z.string().optional(),
    centroid: z.object({ lat: z.number(), lng: z.number() }).optional(),
  }),
  mood: z.string(),
  createdAt: z.string(),
  stops: z.tuple([stopShape, stopShape, stopShape]),
  confidence: z.enum(['strong', 'ok', 'weak']),
  providerKind: z.enum(['qloo', 'fixture']),
  alternatives: z.array(candidateShape).default([]),
  unfilledSlots: z.array(z.enum(['open', 'main', 'close'])).default([]),
  // Optional with an empty default, so links made before intent existed
  // still decode.
  intentEcho: z
    .object({
      applied: z.array(z.object({ label: z.string(), detail: z.string() })),
      ignored: z.array(z.object({ label: z.string(), reason: z.string() })),
    })
    .default({ applied: [], ignored: [] }),
  // Optional with defaults, so links made before the narrative existed decode.
  narrative: z
    .object({ line: z.string(), evidence: z.array(evidenceShape) })
    .default({ line: '', evidence: [] }),
  narrativeWindow: z
    .object({ startHour: z.number(), endHour: z.number() })
    .default({ startHour: 18, endHour: 23 }),
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

  const checked = routeShape.safeParse(parsed)
  if (!checked.success) return null

  // Return the VALIDATED data, never the raw object. Passing `parsed` through
  // after a yes/no check leaves every field the schema does not describe
  // unchecked, and the UI then renders it.
  return { ...checked.data, trace: [] } as Route
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
