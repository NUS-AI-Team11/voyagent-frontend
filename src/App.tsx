import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { fetchAgents, fetchHealth, fetchVersion, fetchWorkflowSteps, getApiBase, runPlanStream } from './lib/api'
import type { AgentInfoItem, PlanResponse, WorkflowStepItem } from './types/api'

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

function JsonBlock({ title, data }: { title: string; data: unknown }) {
  const text = useMemo(() => JSON.stringify(data, null, 2), [data])
  return (
    <details className="group rounded-2xl border border-slate-200/90 bg-white shadow-sm transition-shadow open:shadow-md">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="text-xs font-normal text-slate-500 group-open:rotate-180 transition-transform">▼</span>
      </summary>
      <div className="border-t border-slate-100 px-1 pb-3">
        <pre
          className="max-h-80 overflow-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-sky-100/95"
          tabIndex={0}
        >
          {text}
        </pre>
      </div>
    </details>
  )
}

const FALLBACK_PIPELINE_STEPS: WorkflowStepItem[] = [
  { step_index: 1, label: 'User Preference', output_field: 'travel_profile', required: true },
  { step_index: 2, label: 'Spot Recommendation', output_field: 'spot_list', required: true },
  { step_index: 3, label: 'Dining Recommendation', output_field: 'dining_list', required: true },
  { step_index: 4, label: 'Route & Hotel Planning', output_field: 'itinerary', required: true },
  { step_index: 5, label: 'Cost Optimization', output_field: 'final_handbook', required: true },
]

function PipelineProgressBar({
  steps,
  isRunning,
  doneIdx,
  runningIdx,
  statusLabel,
}: {
  steps: WorkflowStepItem[]
  isRunning: boolean
  doneIdx: number
  runningIdx: number
  statusLabel: string
}) {
  const n = Math.max(steps.length, 1)
  const pct = Math.min(100, Math.round((doneIdx / n) * 100))

  return (
    <div className="mb-8 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 shadow-inner ring-1 ring-slate-100/80">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700/90">Pipeline progress</p>
          <p className="mt-1 text-sm font-medium text-slate-800">
            {isRunning && statusLabel ? statusLabel : isRunning ? 'Working…' : doneIdx >= n ? 'All steps finished' : 'Ready when you are'}
          </p>
        </div>
        <span className="text-xs font-medium tabular-nums text-slate-500">
          {doneIdx}/{n} complete
        </span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 via-sky-500 to-teal-500 transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {steps.map((s) => {
          const done = doneIdx >= s.step_index
          const active = isRunning && runningIdx === s.step_index
          return (
            <span
              key={s.step_index}
              className={`inline-flex max-w-[11rem] items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition ${
                done
                  ? 'bg-emerald-50 text-emerald-900 ring-emerald-200/80'
                  : active
                    ? 'bg-sky-50 text-sky-900 ring-sky-300 shadow-sm shadow-sky-900/10'
                    : 'bg-white/90 text-slate-500 ring-slate-200/80'
              }`}
              title={s.output_field}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  done ? 'bg-emerald-500 text-white' : active ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {done ? '✓' : s.step_index}
              </span>
              <span className="truncate">{s.label}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

type SpotPreview = { name: string; description: string; location: string; category: string }
type DiningPreview = { name: string; cuisine_type: string; location: string; price_range: string }

function spotsFromPlan(spotList: PlanResponse['spot_list']): SpotPreview[] {
  if (!spotList || typeof spotList !== 'object') return []
  const raw = (spotList as { spots?: unknown }).spots
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, 8)
    .map((item) => {
      const o = item as Record<string, unknown>
      return {
        name: String(o.name ?? ''),
        description: String(o.description ?? ''),
        location: String(o.location ?? ''),
        category: String(o.category ?? ''),
      }
    })
    .filter((r) => r.name)
}

function diningFromPlan(diningList: PlanResponse['dining_list']): DiningPreview[] {
  if (!diningList || typeof diningList !== 'object') return []
  const raw = (diningList as { restaurants?: unknown }).restaurants
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, 8)
    .map((item) => {
      const o = item as Record<string, unknown>
      return {
        name: String(o.name ?? ''),
        cuisine_type: String(o.cuisine_type ?? ''),
        location: String(o.location ?? ''),
        price_range: String(o.price_range ?? ''),
      }
    })
    .filter((r) => r.name)
}

type ItineraryDayCard = {
  key: string
  title: string
  bullets: string[]
  mealsLine: string | null
  stayLine: string | null
  note: string | null
}

type HandbookSummaryView = {
  title: string
  destination: string
  budget: number
  total_cost: number
  budget_remaining: number
  is_within_budget: boolean
}

type CostBreakdownView = {
  accommodation: number
  transportation: number
  dining: number
  attractions: number
  shopping: number
  miscellaneous: number
  contingency: number
  total: number
}

function numberOrNaN(value: unknown): number {
  return typeof value === 'number' ? value : Number(value)
}

function formatActivityLine(act: Record<string, unknown>): string {
  const t = String(act.time ?? '').trim()
  const n = String(act.name ?? '').trim()
  const loc = String(act.location ?? '').trim()
  if (!n) return ''
  let s = t ? `${t} · ${n}` : n
  if (loc && loc.toUpperCase() !== 'TBD') {
    const shortLoc = loc.length > 48 ? `${loc.slice(0, 45)}…` : loc
    s += ` — ${shortLoc}`
  }
  const transit = numberOrNaN(act.travel_minutes_from_previous)
  if (Number.isFinite(transit) && transit > 0) {
    s += ` (+${Math.round(transit)}m transit)`
  }
  return s
}

function itineraryDayCardsFromApi(result: PlanResponse): ItineraryDayCard[] | null {
  const itin = result.itinerary as { days?: Record<string, unknown>[] } | null | undefined
  if (itin?.days && Array.isArray(itin.days) && itin.days.length > 0) {
    return itin.days.map((day, i) => {
      const activities = (day.activities as unknown[]) ?? []
      const bullets = activities
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((a) => formatActivityLine(a))
        .filter(Boolean)
      const meals = day.meals as Record<string, string> | undefined
      let mealsLine: string | null = null
      if (meals && typeof meals === 'object') {
        const parts = (['breakfast', 'lunch', 'dinner'] as const)
          .map((k) => {
            const v = String(meals[k] ?? '').trim()
            return v && v.toUpperCase() !== 'TBD' ? `${k}: ${v}` : ''
          })
          .filter(Boolean)
        if (parts.length) mealsLine = parts.join(' · ')
      }
      const acc = day.accommodation as Record<string, unknown> | null | undefined
      let stayLine: string | null = null
      if (acc && typeof acc === 'object') {
        const name = String(acc.name ?? '').trim()
        const address = String(acc.address ?? '').trim()
        const nightlyCost = numberOrNaN(acc.cost_per_night)
        const stayBits: string[] = []
        if (name && name.toUpperCase() !== 'TBD') stayBits.push(name)
        if (address && address.toUpperCase() !== 'TBD') stayBits.push(address)
        if (Number.isFinite(nightlyCost) && nightlyCost > 0) {
          stayBits.push(`$${nightlyCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}/night`)
        }
        if (stayBits.length > 0) stayLine = stayBits.join(' · ')
      }
      const noteRaw = String(day.notes ?? '').trim()
      const note = noteRaw && noteRaw.toUpperCase() !== 'TBD' ? noteRaw : null
      const dn = typeof day.day_number === 'number' ? day.day_number : i + 1
      const dt = String(day.date ?? '').trim()
      return {
        key: `day-${dn}-${i}`,
        title: `Day ${dn}` + (dt ? ` (${dt})` : ''),
        bullets,
        mealsLine,
        stayLine,
        note,
      }
    })
  }
  return itineraryDayCardsFromNarrative(result.itinerary_narrative)
}

function summaryFromResult(result: PlanResponse): HandbookSummaryView | null {
  const summary = result.final_handbook_summary as Record<string, unknown> | null | undefined
  if (summary && typeof summary === 'object') {
    const budget = numberOrNaN(summary.budget)
    const totalCost = numberOrNaN(summary.total_cost)
    const remaining = numberOrNaN(summary.budget_remaining)
    const explicitWithin = summary.is_within_budget
    const within =
      typeof explicitWithin === 'boolean'
        ? explicitWithin
        : Number.isFinite(remaining)
          ? remaining >= 0
          : Number.isFinite(budget) && Number.isFinite(totalCost)
            ? totalCost <= budget
            : false
    return {
      title: String(summary.title ?? 'Your handbook'),
      destination: String(summary.destination ?? ''),
      budget,
      total_cost: totalCost,
      budget_remaining: remaining,
      is_within_budget: within,
    }
  }

  const handbook = result.final_handbook as Record<string, unknown> | null | undefined
  if (!handbook || typeof handbook !== 'object') return null
  const cb = (handbook.cost_breakdown as Record<string, unknown> | undefined) ?? {}
  const budget = numberOrNaN(handbook.budget)
  const total = numberOrNaN(cb.total)
  const remaining = numberOrNaN(handbook.budget_remaining)
  return {
    title: String(handbook.title ?? 'Your handbook'),
    destination: String(handbook.destination ?? ''),
    budget,
    total_cost: total,
    budget_remaining: remaining,
    is_within_budget: Number.isFinite(remaining)
      ? remaining >= 0
      : Number.isFinite(total) && Number.isFinite(budget)
        ? total <= budget
        : false,
  }
}

function costBreakdownFromResult(result: PlanResponse): CostBreakdownView | null {
  const handbook = result.final_handbook as Record<string, unknown> | null | undefined
  if (!handbook || typeof handbook !== 'object') return null
  const cb = handbook.cost_breakdown as Record<string, unknown> | undefined
  if (!cb || typeof cb !== 'object') return null

  return {
    accommodation: numberOrNaN(cb.accommodation),
    transportation: numberOrNaN(cb.transportation),
    dining: numberOrNaN(cb.dining),
    attractions: numberOrNaN(cb.attractions),
    shopping: numberOrNaN(cb.shopping),
    miscellaneous: numberOrNaN(cb.miscellaneous),
    contingency: numberOrNaN(cb.contingency),
    total: numberOrNaN(cb.total),
  }
}

function itineraryDayCardsFromNarrative(nar: string | null | undefined): ItineraryDayCard[] | null {
  if (!nar?.trim()) return null
  const blocks = nar.trim().split(/\n\n+/)
  const cards: ItineraryDayCard[] = []
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const first = lines[0] ?? ''
    if (!/^Day\s+\d+/i.test(first)) continue
    const bullets: string[] = []
    let mealsLine: string | null = null
    let stayLine: string | null = null
    let note: string | null = null
    for (const line of lines.slice(1)) {
      if (line.startsWith('•') || line.startsWith('-')) {
        bullets.push(line.replace(/^[•\-]\s*/, ''))
      } else if (/^meals:/i.test(line)) {
        mealsLine = line
      } else if (/^stay:/i.test(line)) {
        stayLine = line.replace(/^stay:\s*/i, '').trim()
      } else if (!/^here is your day-by-day plan/i.test(line)) {
        note = note ? `${note} ${line}` : line
      }
    }
    cards.push({
      key: `nar-${cards.length}-${first.slice(0, 24)}`,
      title: first,
      bullets,
      mealsLine,
      stayLine,
      note,
    })
  }
  return cards.length ? cards : null
}

function SpecialistsHelpPopover({
  open,
  onClose,
  loading,
  error,
  agents,
  anchorRef,
}: {
  open: boolean
  onClose: () => void
  loading: boolean
  error: boolean
  agents: AgentInfoItem[] | undefined
  anchorRef: RefObject<HTMLElement | null>
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, onClose, anchorRef])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="How Voyagent works"
      className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] origin-top-right rounded-2xl border border-amber-200/90 bg-amber-50/95 p-4 text-left shadow-xl shadow-amber-900/10 ring-1 ring-amber-100/80 backdrop-blur-sm"
    >
      <div className="absolute -top-1.5 right-4 h-3 w-3 rotate-45 border-l border-t border-amber-200/90 bg-amber-50/95" aria-hidden />
      <p className="pr-6 font-outfit text-sm font-semibold text-amber-950">Specialists on your trip</p>
      <p className="mt-1 text-xs leading-snug text-amber-900/85">
        Five agents run in order; each step feeds the next. Expand a day in your handbook to read details without long
        scrolling.
      </p>
      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 text-xs">
        {loading && <p className="text-amber-800/80">Loading…</p>}
        {error && <p className="text-rose-700">Could not load agent list.</p>}
        {agents?.map((a, idx) => (
          <div key={a.name} className="rounded-xl border border-amber-100/80 bg-white/90 px-3 py-2 shadow-sm">
            <p className="font-semibold text-slate-900">
              {idx + 1}. {a.name}
            </p>
            <p className="mt-0.5 leading-snug text-slate-600">{a.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function DayAccordionItem({ day, defaultExpanded }: { day: ItineraryDayCard; defaultExpanded: boolean }) {
  const [open, setOpen] = useState(defaultExpanded)
  return (
    <details
      className="group self-start rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm ring-1 ring-slate-100/80 open:shadow-md open:ring-sky-200/40"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="font-outfit text-sm font-semibold text-slate-900">{day.title}</span>
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-500">
          {day.bullets.length} stops
          <span className="ml-1 text-slate-400 group-open:rotate-180 transition-transform">▼</span>
        </span>
      </summary>
      <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-700">
        {day.bullets.length > 0 ? (
          <ul className="space-y-2">
            {day.bullets.map((b, bi) => (
              <li key={`${day.key}-b-${bi}`} className="flex gap-2 text-xs leading-relaxed sm:text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" aria-hidden />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">No timed stops listed for this day.</p>
        )}
        {day.mealsLine ? <p className="mt-3 text-xs font-medium text-amber-900/90">{day.mealsLine}</p> : null}
        {day.stayLine ? <p className="mt-2 text-xs text-slate-600">Stay: {day.stayLine}</p> : null}
        {day.note ? <p className="mt-2 text-xs italic text-slate-500">{day.note}</p> : null}
      </div>
    </details>
  )
}

function ItineraryDayAccordion({ days }: { days: ItineraryDayCard[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
      {days.map((day, idx) => (
        <DayAccordionItem key={day.key} day={day} defaultExpanded={idx === 0} />
      ))}
    </div>
  )
}

function HandbookSummaryCard({ data }: { data: HandbookSummaryView }) {
  const dest = data.destination || '—'
  const title = data.title || 'Your handbook'
  const budget = data.budget
  const total = data.total_cost
  const remaining = data.budget_remaining
  const within = data.is_within_budget

  return (
    <div className="relative overflow-hidden rounded-2xl border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-sky-50 p-6 shadow-lg shadow-teal-900/5">
      <div className="absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-teal-400/10 blur-2xl" />
      <p className="text-xs font-semibold uppercase tracking-wider text-teal-700/90">Trip overview</p>
      <h3 className="mt-1 font-outfit text-2xl font-semibold tracking-tight text-slate-900">{title}</h3>
      <p className="mt-1 text-slate-600">{dest}</p>
      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-slate-100">
          <dt className="text-xs text-slate-500">Budget</dt>
          <dd className="font-semibold text-slate-900">${Number.isFinite(budget) ? budget.toLocaleString() : '—'}</dd>
        </div>
        <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-slate-100">
          <dt className="text-xs text-slate-500">Est. total</dt>
          <dd className="font-semibold text-slate-900">${Number.isFinite(total) ? total.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</dd>
        </div>
        <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-slate-100">
          <dt className="text-xs text-slate-500">Remaining</dt>
          <dd className={`font-semibold ${remaining < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            ${Number.isFinite(remaining) ? remaining.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
          </dd>
        </div>
        <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-slate-100">
          <dt className="text-xs text-slate-500">Status</dt>
          <dd className="font-semibold text-slate-900">{within ? 'Within budget' : 'Over budget'}</dd>
        </div>
      </dl>
    </div>
  )
}

function CostBreakdownCard({ breakdown }: { breakdown: CostBreakdownView }) {
  const rows = [
    ['Accommodation', breakdown.accommodation],
    ['Transportation', breakdown.transportation],
    ['Dining', breakdown.dining],
    ['Attractions', breakdown.attractions],
    ['Shopping', breakdown.shopping],
    ['Miscellaneous', breakdown.miscellaneous],
    ['Contingency', breakdown.contingency],
  ] as const

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <h4 className="font-outfit text-sm font-semibold uppercase tracking-wider text-slate-500">Cost breakdown</h4>
      <dl className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <dt className="text-slate-600">{label}</dt>
            <dd className="font-medium text-slate-900">
              {Number.isFinite(value) ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 border-t border-slate-100 pt-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-700">Total</span>
        <span className="font-semibold text-slate-900">
          {Number.isFinite(breakdown.total) ? `$${breakdown.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
        </span>
      </div>
    </section>
  )
}

function HandbookCardView({ result }: { result: PlanResponse }) {
  const summary = useMemo(() => summaryFromResult(result), [result])
  const breakdown = useMemo(() => costBreakdownFromResult(result), [result])
  const dayCards = useMemo(() => itineraryDayCardsFromApi(result), [result])
  const spots = useMemo(() => spotsFromPlan(result.spot_list), [result.spot_list])
  const dining = useMemo(() => diningFromPlan(result.dining_list), [result.dining_list])
  const handbook = result.final_handbook as Record<string, unknown> | null | undefined
  const tips = useMemo(() => {
    const t = handbook?.tips_and_tricks
    return Array.isArray(t) ? (t as unknown[]).map((x) => String(x)).filter(Boolean) : []
  }, [handbook])
  const packing = useMemo(() => {
    const t = handbook?.packing_list
    return Array.isArray(t) ? (t as unknown[]).map((x) => String(x)).filter(Boolean) : []
  }, [handbook])
  const optimizations = useMemo(() => {
    const t = handbook?.optimization_recommendations
    if (!Array.isArray(t)) return []
    return t
      .map((item) => {
        const o = item as Record<string, unknown>
        return {
          category: String(o.category ?? ''),
          suggestion: String(o.suggestion ?? ''),
          savings:
            typeof o.potential_savings === 'number'
              ? o.potential_savings
              : Number(o.potential_savings),
        }
      })
      .filter((r) => r.suggestion)
  }, [handbook])
  const locationHint = (() => {
    const itin = result.itinerary as { location?: string } | null | undefined
    if (itin?.location && String(itin.location).trim()) return String(itin.location)
    const s = summary as { destination?: string } | undefined
    if (s?.destination) return String(s.destination)
    return ''
  })()

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/90 shadow-xl shadow-slate-900/10 ring-1 ring-slate-100">
      <div className="border-b border-slate-100 bg-gradient-to-r from-sky-50/50 via-white to-teal-50/40 px-6 py-5 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-800/80">Your travel handbook</p>
        <h3 className="mt-1 font-outfit text-2xl font-semibold tracking-tight text-slate-900">Curated for this trip</h3>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Day-by-day details fold into cards so you scan faster. Raw JSON stays under Developer.
        </p>
      </div>

      <div className="space-y-8 px-6 py-8 sm:px-8">
        <div className="grid gap-8 xl:grid-cols-12">
          <div className="space-y-8 xl:col-span-7">
            {summary && <HandbookSummaryCard data={summary} />}

            {dayCards && dayCards.length > 0 && (
              <section>
                <h4 className="font-outfit text-sm font-semibold uppercase tracking-wider text-slate-500">Itinerary</h4>
                {locationHint ? (
                  <p className="mt-2 text-xs text-slate-600">Day-by-day plan for {locationHint}. Tap a day to expand.</p>
                ) : (
                  <p className="mt-2 text-xs text-slate-600">Tap a day to expand stops and meals.</p>
                )}
                <div className="mt-4">
                  <ItineraryDayAccordion days={dayCards} />
                </div>
              </section>
            )}
          </div>

          <div className="space-y-8 xl:col-span-5">
            {spots.length > 0 && (
              <section>
                <h4 className="font-outfit text-sm font-semibold uppercase tracking-wider text-slate-500">Featured places</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  {spots.map((s) => (
                    <article
                      key={s.name}
                      className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm ring-1 ring-slate-50"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-700/90">{s.category || 'Spot'}</p>
                      <p className="mt-1 font-medium text-slate-900">{s.name}</p>
                      <p className="mt-1 line-clamp-3 text-xs leading-snug text-slate-600">{s.description}</p>
                      {s.location ? <p className="mt-2 text-xs text-slate-500 line-clamp-2">{s.location}</p> : null}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {dining.length > 0 && (
              <section>
                <h4 className="font-outfit text-sm font-semibold uppercase tracking-wider text-slate-500">Dining</h4>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  {dining.map((d) => (
                    <li
                      key={d.name}
                      className="rounded-2xl border border-amber-100/90 bg-amber-50/40 px-4 py-3 ring-1 ring-amber-100/60"
                    >
                      <p className="font-medium text-slate-900">{d.name}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {d.cuisine_type}
                        {d.price_range ? ` · ${d.price_range}` : ''}
                      </p>
                      {d.location ? <p className="mt-1 text-xs text-slate-500 line-clamp-2">{d.location}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {optimizations.length > 0 && (
              <section>
                <h4 className="font-outfit text-sm font-semibold uppercase tracking-wider text-slate-500">Budget ideas</h4>
                <ul className="mt-3 space-y-2">
                  {optimizations.map((o, i) => (
                    <li key={i} className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-800">
                      <span className="font-medium text-slate-900">{o.category}</span>
                      <span className="text-slate-600"> — {o.suggestion}</span>
                      {Number.isFinite(o.savings) ? (
                        <span className="mt-1 block text-xs font-medium text-teal-800">
                          Potential savings ~${o.savings.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {breakdown && <CostBreakdownCard breakdown={breakdown} />}

            {(tips.length > 0 || packing.length > 0) && (
              <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1">
                {tips.length > 0 && (
                  <div>
                    <h4 className="font-outfit text-sm font-semibold uppercase tracking-wider text-slate-500">Tips</h4>
                    <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-slate-700">
                      {tips.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {packing.length > 0 && (
                  <div>
                    <h4 className="font-outfit text-sm font-semibold uppercase tracking-wider text-slate-500">Packing ideas</h4>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {packing.map((p) => (
                        <li
                          key={p}
                          className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200/80"
                        >
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ResultView({ result }: { result: PlanResponse }) {
  return (
    <div className="space-y-5">
      <div
        className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${
          result.ok
            ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80'
            : 'bg-rose-50 text-rose-800 ring-1 ring-rose-200/80'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${result.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        {result.ok ? 'Handbook generated successfully' : 'Completed with issues — see below'}
      </div>

      {(result.errors?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-5 shadow-sm">
          <h3 className="font-outfit text-lg font-semibold text-rose-900">Something went wrong</h3>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-rose-800">
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {(result.warnings?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-5 shadow-sm">
          <h3 className="font-outfit text-lg font-semibold text-amber-900">Heads up</h3>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-amber-900/90">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <HandbookCardView result={result} />

      <details className="group rounded-2xl border border-slate-200/90 bg-slate-50/50 shadow-sm open:bg-white">
        <summary className="cursor-pointer list-none px-5 py-4 font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            Developer — raw JSON
            <span className="text-xs font-normal text-slate-500 group-open:rotate-180 transition-transform">▼</span>
          </span>
        </summary>
        <div className="space-y-3 border-t border-slate-100 px-3 pb-4 pt-2">
          {result.travel_profile && <JsonBlock title="Travel profile" data={result.travel_profile} />}
          {result.spot_list && <JsonBlock title="Recommended places" data={result.spot_list} />}
          {result.dining_list && <JsonBlock title="Dining picks" data={result.dining_list} />}
          {result.itinerary && <JsonBlock title="Itinerary" data={result.itinerary} />}
          {result.final_handbook && <JsonBlock title="Full handbook (raw)" data={result.final_handbook} />}
          <JsonBlock title="Technical metadata" data={result.metadata} />
        </div>
      </details>
    </div>
  )
}

export default function App() {
  const [input, setInput] = useState('')
  const [pipe, setPipe] = useState({ doneIdx: 0, runningIdx: 0, label: '' })
  const [lastErrorDetail, setLastErrorDetail] = useState('')
  const [lastRequestAt, setLastRequestAt] = useState<string>('')
  const [lastRequestApiBase, setLastRequestApiBase] = useState<string>('')
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [specialistsHelpOpen, setSpecialistsHelpOpen] = useState(false)
  const specialistsHelpBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handleOnline = () => setIsBrowserOnline(true)
    const handleOffline = () => setIsBrowserOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth })
  const version = useQuery({ queryKey: ['version'], queryFn: fetchVersion })
  const agents = useQuery({ queryKey: ['agents'], queryFn: fetchAgents })
  const steps = useQuery({ queryKey: ['workflow-steps'], queryFn: fetchWorkflowSteps })

  const pipelineSteps = steps.data?.steps?.length ? steps.data.steps : FALLBACK_PIPELINE_STEPS

  const plan = useMutation({
    mutationFn: (text: string) => {
      const total = Math.max(pipelineSteps.length, 1)
      return runPlanStream(text, (ev) => {
        if (ev.type === 'step_running') {
          setPipe((p) => ({
            ...p,
            runningIdx: ev.step_index,
            label: ev.label,
          }))
        }
        if (ev.type === 'step_done') {
          const last = ev.step_index >= total
          setPipe((p) => ({
            ...p,
            doneIdx: Math.max(p.doneIdx, ev.step_index),
            runningIdx: 0,
            label: last ? '' : p.label,
          }))
        }
      })
    },
    onMutate: () => setPipe({ doneIdx: 0, runningIdx: 0, label: 'Starting…' }),
    onSuccess: () =>
      setPipe((p) => ({
        ...p,
        doneIdx: Math.max(p.doneIdx, pipelineSteps.length),
        runningIdx: 0,
        label: '',
      })),
    onError: (error) => {
      setPipe((p) => ({ ...p, runningIdx: 0, label: '' }))
      const detail = error instanceof Error ? error.message : String(error ?? 'Unknown error')
      setLastErrorDetail(detail)
    },
  })

  const canSubmit = input.trim().length > 0 && !plan.isPending
  const apiOk = health.isSuccess && health.data.status === 'ok'

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-teal-500 text-lg font-bold text-white shadow-md shadow-sky-900/15">
              V
            </span>
            <div>
              <span className="font-outfit text-lg font-semibold tracking-tight text-slate-900">Voyagent</span>
              <p className="text-xs text-slate-500">AI travel handbooks</p>
            </div>
          </a>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ring-1 ${
                health.isLoading
                  ? 'bg-slate-100 text-slate-600 ring-slate-200'
                  : apiOk
                    ? 'bg-emerald-50 text-emerald-800 ring-emerald-200/80'
                    : 'bg-rose-50 text-rose-800 ring-rose-200/80'
              }`}
            >
              {health.isLoading && <Spinner className="h-3.5 w-3.5 text-slate-500" />}
              {!health.isLoading && (
                <span className={`h-2 w-2 rounded-full ${apiOk ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              )}
              {health.isLoading && 'Connecting…'}
              {health.isError && 'Service unavailable'}
              {apiOk && 'Live'}
            </div>
            {version.isSuccess && (
              <span className="hidden text-slate-500 sm:inline">
                {version.data.app_name} <span className="text-slate-400">v{version.data.app_version}</span>
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="hero-mesh border-b border-slate-200/60">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-widest text-sky-700/90">Plan smarter. Travel calmer.</p>
          <h1 className="mt-3 max-w-3xl font-outfit text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Your next trip, distilled into one clear handbook.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            Tell us where you are going — we orchestrate preferences, places, dining, routes, and costs into a
            structured plan you can trust.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-600">
            <span className="rounded-full bg-white/90 px-4 py-2 shadow-sm ring-1 ring-slate-200/80">5 AI specialists</span>
            <span className="rounded-full bg-white/90 px-4 py-2 shadow-sm ring-1 ring-slate-200/80">Budget-aware</span>
            <span className="rounded-full bg-white/90 px-4 py-2 shadow-sm ring-1 ring-slate-200/80">Transparent steps</span>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <div className="w-full">
          <div>
            <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
              <PipelineProgressBar
                steps={pipelineSteps}
                isRunning={plan.isPending}
                doneIdx={pipe.doneIdx}
                runningIdx={pipe.runningIdx}
                statusLabel={pipe.label}
              />
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="font-outfit text-xl font-semibold text-slate-900">Describe your trip</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Destination, dates, budget, party size, pace, and any dietary or mobility needs.
                  </p>
                </div>
                <div className="relative shrink-0 pt-0.5">
                  <button
                    ref={specialistsHelpBtnRef}
                    type="button"
                    onClick={() => setSpecialistsHelpOpen((o) => !o)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-600 shadow-sm ring-slate-100 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                    aria-expanded={specialistsHelpOpen}
                    aria-label="How Voyagent specialists work"
                    title="How Voyagent specialists work"
                  >
                    ?
                  </button>
                  <SpecialistsHelpPopover
                    open={specialistsHelpOpen}
                    onClose={() => setSpecialistsHelpOpen(false)}
                    loading={agents.isLoading}
                    error={agents.isError}
                    agents={agents.data?.agents}
                    anchorRef={specialistsHelpBtnRef}
                  />
                </div>
              </div>
              <label htmlFor="trip-input" className="sr-only">
                Trip requirements
              </label>
              <textarea
                id="trip-input"
                rows={12}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Example: 6 nights in Kyoto for 2 adults, Apr 8–14 2026, total budget USD 4,200 (excl. flights). We love temples, neighborhoods, and vegetarian food. Mid-range hotels near transit…"
                spellCheck={false}
                className="mt-5 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-inner transition focus:border-sky-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-sky-500/15"
              />
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">By continuing, you agree your text is sent to your configured Voyagent API.</p>
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => {
                    setLastErrorDetail('')
                    setLastRequestAt(new Date().toISOString())
                    try {
                      setLastRequestApiBase(getApiBase())
                    } catch {
                      setLastRequestApiBase('(unresolved)')
                    }
                    plan.mutate(input.trim())
                  }}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-teal-600 px-6 text-sm font-semibold text-white shadow-lg shadow-sky-900/20 transition hover:from-sky-500 hover:to-teal-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {plan.isPending && <Spinner className="h-4 w-4 text-white" />}
                  {plan.isPending ? 'Building your handbook…' : 'Generate handbook'}
                </button>
              </div>
              {plan.isError && (
                <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
                  {plan.error instanceof Error ? plan.error.message : 'Request failed'}
                </p>
              )}
              {plan.isError && lastErrorDetail && (
                <details className="mt-3 rounded-xl border border-rose-200/90 bg-white px-4 py-3 text-xs text-rose-900">
                  <summary className="cursor-pointer font-medium">Show technical error detail</summary>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-lg bg-rose-50 p-3 text-[11px] leading-relaxed">
                    {lastErrorDetail}
                  </pre>
                </details>
              )}
              <details className="mt-3 rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-xs text-slate-700">
                <summary className="cursor-pointer font-medium">Show client debug info</summary>
                <div className="mt-2 grid gap-2 text-[11px] leading-relaxed">
                  <p>
                    <span className="font-medium text-slate-800">Browser online:</span>{' '}
                    {isBrowserOnline ? 'yes' : 'no'}
                  </p>
                  <p>
                    <span className="font-medium text-slate-800">Last request at:</span>{' '}
                    {lastRequestAt || 'N/A'}
                  </p>
                  <p className="break-all">
                    <span className="font-medium text-slate-800">API base:</span>{' '}
                    {lastRequestApiBase || 'N/A'}
                  </p>
                </div>
              </details>
            </section>

            {plan.isSuccess && (
              <section className="mt-10">
                <h2 className="font-outfit text-xl font-semibold text-slate-900">Your results</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Overview and day cards use the full width; tap the ? above for specialist notes.
                </p>
                <div className="mt-6">
                  <ResultView result={plan.data} />
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      <footer className="mt-16 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} Voyagent · Practice module</span>
          <span className="font-mono text-xs text-slate-400">
            API: {import.meta.env.VITE_API_BASE_URL?.trim() || 'http://127.0.0.1:8000 (dev default)'}
          </span>
        </div>
      </footer>
    </div>
  )
}
