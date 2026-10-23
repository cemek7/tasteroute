// `server-only` throws when imported outside a React Server Component build.
// Vitest runs plain Node, so the real guard cannot load. Aliasing it here keeps
// the guard active in the Next build while letting server modules be unit
// tested. Importing this stub does nothing, which is the point.
export {}
