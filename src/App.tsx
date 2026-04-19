import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { fetchAgents, fetchHealth, fetchVersion, fetchWorkflowSteps, runPlanStream } from './lib/api'
import type { PlanResponse, WorkflowStepItem } from './types/api'

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

function HandbookSummaryCard({ data }: { data: Record<string, unknown> }) {
  const dest = String(data.destination ?? '—')
  const title = String(data.title ?? 'Your handbook')
  const budget = typeof data.budget === 'number' ? data.budget : Number(data.budget)
  const total = typeof data.total_cost === 'number' ? data.total_cost : Number(data.total_cost)
  const remaining = typeof data.budget_remaining === 'number' ? data.budget_remaining : Number(data.budget_remaining)
  const within = Boolean(data.is_within_budget)

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

function HandbookCardView({ result }: { result: PlanResponse }) {
  const summary = result.final_handbook_summary as Record<string, unknown> | null | undefined
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
  const narrative = result.itinerary_narrative?.trim()

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/90 shadow-xl shadow-slate-900/10 ring-1 ring-slate-100">
      <div className="border-b border-slate-100 bg-gradient-to-r from-sky-50/50 via-white to-teal-50/40 px-6 py-5 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-800/80">Your travel handbook</p>
        <h3 className="mt-1 font-outfit text-2xl font-semibold tracking-tight text-slate-900">Curated for this trip</h3>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          A readable snapshot of the plan — structured data stays available under Developer view.
        </p>
      </div>

      <div className="space-y-8 px-6 py-8 sm:px-8">
        {summary && Object.keys(summary).length > 0 && <HandbookSummaryCard data={summary} />}

        {narrative && (
          <section>
            <h4 className="font-outfit text-sm font-semibold uppercase tracking-wider text-slate-500">Itinerary</h4>
            <div className="mt-3 rounded-2xl border border-slate-100 bg-white/90 p-5 text-sm leading-relaxed text-slate-800 shadow-sm ring-1 ring-slate-100/80">
              <div className="whitespace-pre-wrap font-serif text-[15px] leading-7 text-slate-800">{narrative}</div>
            </div>
          </section>
        )}

        {spots.length > 0 && (
          <section>
            <h4 className="font-outfit text-sm font-semibold uppercase tracking-wider text-slate-500">Featured places</h4>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {spots.map((s) => (
                <article
                  key={s.name}
                  className="min-w-[220px] max-w-[260px] shrink-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm ring-1 ring-slate-50"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-700/90">{s.category || 'Spot'}</p>
                  <p className="mt-1 font-medium text-slate-900">{s.name}</p>
                  <p className="mt-1 line-clamp-3 text-xs leading-snug text-slate-600">{s.description}</p>
                  {s.location ? <p className="mt-2 text-xs text-slate-500">{s.location}</p> : null}
                </article>
              ))}
            </div>
          </section>
        )}

        {dining.length > 0 && (
          <section>
            <h4 className="font-outfit text-sm font-semibold uppercase tracking-wider text-slate-500">Dining</h4>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
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
                  {d.location ? <p className="mt-1 text-xs text-slate-500">{d.location}</p> : null}
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

        {(tips.length > 0 || packing.length > 0) && (
          <section className="grid gap-6 sm:grid-cols-2">
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
    onError: () => setPipe((p) => ({ ...p, runningIdx: 0, label: '' })),
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
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
              <PipelineProgressBar
                steps={pipelineSteps}
                isRunning={plan.isPending}
                doneIdx={pipe.doneIdx}
                runningIdx={pipe.runningIdx}
                statusLabel={pipe.label}
              />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-outfit text-xl font-semibold text-slate-900">Describe your trip</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Destination, dates, budget, party size, pace, and any dietary or mobility needs.
                  </p>
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
                  onClick={() => plan.mutate(input.trim())}
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
            </section>

            {plan.isSuccess && (
              <section className="mt-10">
                <h2 className="font-outfit text-xl font-semibold text-slate-900">Your results</h2>
                <p className="mt-1 text-sm text-slate-600">Review the summary, then expand sections for full detail.</p>
                <div className="mt-6">
                  <ResultView result={plan.data} />
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-6 lg:col-span-5">
            <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-lg shadow-slate-900/5">
              <h2 className="font-outfit text-lg font-semibold text-slate-900">Specialists on your trip</h2>
              <p className="mt-1 text-xs text-slate-500">Purpose-built agents behind every section.</p>
              {agents.isLoading && (
                <div className="mt-4 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
                  ))}
                </div>
              )}
              {agents.isError && <p className="mt-4 text-sm text-rose-600">Could not load agents.</p>}
              {agents.isSuccess && (
                <ul className="mt-4 space-y-3">
                  {agents.data.agents.map((a) => (
                    <li
                      key={a.name}
                      className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 transition hover:border-sky-200/80 hover:bg-white"
                    >
                      <p className="text-sm font-semibold text-slate-900">{a.name}</p>
                      <p className="mt-1 text-xs leading-snug text-slate-600">{a.description}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
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
