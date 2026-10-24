'use client'

import { useState } from 'react'
import {
  DIETARY_IDS,
  OCCASION_IDS,
  PARTY_COMPOSITIONS,
  PERSONAS,
  VIBE_IDS,
  AGE_BANDS,
} from '@/lib/intent/vocabulary'
import type { DietaryId, Intent } from '@/lib/providers/types'

/**
 * Collapsed by default, and nothing in it is required. A judge who wants a
 * route in thirty seconds never opens this; anyone who wants the evening to
 * be theirs does.
 */
export function TunePanel({
  intent,
  onChange,
}: {
  intent: Intent
  onChange: (next: Intent) => void
}) {
  const [open, setOpen] = useState(false)
  const discovery = intent.discovery ?? 0.5

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs underline"
        style={{ color: 'var(--muted)' }}
      >
        {open ? 'Hide options' : 'Tune this (optional)'}
      </button>

      {open && (
        <div
          className="mt-3 space-y-4 rounded-md border p-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <label className="block">
            <span
              className="flex justify-between text-[11px] uppercase tracking-wide"
              style={{ color: 'var(--muted)' }}
            >
              <span>The well-known ones</span>
              <span>Hidden gems</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={discovery}
              onChange={(e) => onChange({ ...intent, discovery: Number(e.target.value) })}
              className="mt-2 w-full"
              aria-label="How well known should the places be"
            />
          </label>
          <fieldset>
            <legend className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Vibe
            </legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {VIBE_IDS.map((v) => {
                const on = intent.vibe?.includes(v) ?? false
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      const current = intent.vibe ?? []
                      const next = on ? current.filter((x) => x !== v) : [...current, v]
                      onChange({ ...intent, vibe: next.length ? next : undefined })
                    }}
                    className="rounded-full border px-2.5 py-1 text-xs"
                    style={{
                      borderColor: on ? 'var(--accent)' : 'var(--border)',
                      color: on ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    {v}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              The night is for
            </span>
            <select
              value={intent.occasion ?? ''}
              onChange={(e) =>
                onChange({
                  ...intent,
                  occasion: e.target.value ? (e.target.value as typeof OCCASION_IDS[number]) : undefined,
                })
              }
              className="mt-1 w-full rounded-md border px-3 py-2 text-base"
              style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--fg)' }}
            >
              <option value="">no particular occasion</option>
              {OCCASION_IDS.map((o) => (
                <option key={o} value={o}>
                  {o.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-3">
            <label className="flex-1">
              <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                Going with
              </span>
              <select
                value={intent.party?.composition ?? ''}
                onChange={(e) =>
                  onChange({
                    ...intent,
                    party: e.target.value
                      ? {
                          size: intent.party?.size ?? 2,
                          composition: e.target.value as typeof PARTY_COMPOSITIONS[number],
                        }
                      : undefined,
                  })
                }
                className="mt-1 w-full rounded-md border px-3 py-2 text-base"
                style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--fg)' }}
              >
                <option value="">not saying</option>
                {PARTY_COMPOSITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="w-24">
              <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                How many
              </span>
              <select
                value={intent.party?.size ?? 2}
                onChange={(e) =>
                  onChange({
                    ...intent,
                    party: { ...intent.party, size: Number(e.target.value) },
                  })
                }
                className="mt-1 w-full rounded-md border px-3 py-2 text-base"
                style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--fg)' }}
              >
                {[1, 2, 3, 4, 6, 8, 12, 20].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              You are
            </span>
            <select
              value={intent.persona ?? ''}
              onChange={(e) =>
                onChange({
                  ...intent,
                  persona: e.target.value ? (e.target.value as typeof PERSONAS[number]) : undefined,
                })
              }
              className="mt-1 w-full rounded-md border px-3 py-2 text-base"
              style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--fg)' }}
            >
              <option value="">not saying</option>
              <option value="newcomer">new to this city</option>
              <option value="local">a local</option>
              <option value="visiting">just visiting</option>
            </select>
          </label>

          <fieldset>
            <legend className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Budget
            </legend>
            <div className="mt-1 flex gap-1.5">
              {([1, 2, 3, 4] as const).map((b) => {
                const on = intent.budget === b
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => onChange({ ...intent, budget: on ? undefined : b })}
                    className="flex-1 rounded border px-2 py-1.5 text-sm"
                    style={{
                      borderColor: on ? 'var(--accent)' : 'var(--border)',
                      color: on ? 'var(--accent)' : 'var(--fg)',
                    }}
                  >
                    {'\u20a6'.repeat(b)}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Must have
            </legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DIETARY_IDS.map((d: DietaryId) => {
                const on = intent.requirements?.dietary?.includes(d) ?? false
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      const current = intent.requirements?.dietary ?? []
                      const next = on ? current.filter((x) => x !== d) : [...current, d]
                      onChange({
                        ...intent,
                        requirements: {
                          ...intent.requirements,
                          dietary: next.length ? next : undefined,
                        },
                      })
                    }}
                    className="rounded-full border px-2.5 py-1 text-xs"
                    style={{
                      borderColor: on ? 'var(--accent)' : 'var(--border)',
                      color: on ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    {d.replace(/_/g, ' ')}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Stay within
            </span>
            <select
              value={intent.area?.radiusMetres ?? 0}
              onChange={(e) => {
                const m = Number(e.target.value)
                onChange({ ...intent, area: m === 0 ? null : { radiusMetres: m } })
              }}
              className="mt-1 w-full rounded-md border px-3 py-2 text-base"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
                color: 'var(--fg)',
              }}
            >
              <option value={0}>anywhere in the city</option>
              <option value={1000}>1 km</option>
              <option value={3000}>3 km</option>
              <option value={10000}>10 km</option>
            </select>
          </label>
          <details>
            <summary className="cursor-pointer text-xs" style={{ color: 'var(--muted)' }}>
              About you (optional)
            </summary>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>
              Qloo matches taste patterns by age and gender. Nothing here is stored or
              remembered.
            </p>
            <div className="mt-2 flex gap-3">
              <label className="flex-1">
                <select
                  value={intent.demographics?.ageBand ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...intent,
                      demographics: {
                        ...intent.demographics,
                        ageBand: e.target.value
                          ? (e.target.value as typeof AGE_BANDS[number])
                          : undefined,
                      },
                    })
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--fg)' }}
                >
                  <option value="">age: prefer not to say</option>
                  {AGE_BANDS.map((a) => (
                    <option key={a} value={a}>
                      {a.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1">
                <select
                  value={intent.demographics?.gender ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...intent,
                      demographics: {
                        ...intent.demographics,
                        gender: e.target.value
                          ? (e.target.value as 'male' | 'female')
                          : undefined,
                      },
                    })
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--fg)' }}
                >
                  <option value="">gender: prefer not to say</option>
                  <option value="female">female</option>
                  <option value="male">male</option>
                </select>
              </label>
            </div>
          </details>
        </div>
      )}
    </section>
  )
}
