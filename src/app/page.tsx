'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoodForm } from '@/components/MoodForm'
import { SavedRoutes } from '@/components/SavedRoutes'
import { stashRoute } from '@/lib/share/session'
import type { Route } from '@/lib/providers/types'

export default function Home() {
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)

  // Links shared from the build where the result lived on this page.
  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get('r')
    if (shared) router.replace(`/plan?r=${shared}`)
  }, [router])

  const open = (route: Route) => {
    setLeaving(true)
    stashRoute(route)
    router.push('/plan')
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 md:max-w-2xl md:px-6 lg:max-w-5xl lg:px-8 lg:py-14">
      <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">TasteRoute</h1>
      <p className="mt-2 max-w-prose text-sm" style={{ color: 'var(--muted)' }}>
        Say the mood and the hours. Get a plan of three to five stops, in
        order, with the reason for each one.
      </p>

      <MoodForm onRoute={open} />

      {leaving && (
        <p className="mt-4 text-center text-xs" style={{ color: 'var(--muted)' }}>
          Opening your plan…
        </p>
      )}

      <SavedRoutes refreshKey={0} onOpen={open} />

      <footer className="mt-12 text-xs" style={{ color: 'var(--muted)' }}>
        Built by TechClave. Taste data from Qloo.
      </footer>
    </main>
  )
}
