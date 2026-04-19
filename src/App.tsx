import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import './App.css'
import { fetchAgents, fetchHealth, fetchVersion, fetchWorkflowSteps, runPlan } from './lib/api'
import type { PlanResponse } from './types/api'

function JsonBlock({ title, data }: { title: string; data: unknown }) {
  const text = useMemo(() => JSON.stringify(data, null, 2), [data])
  return (
    <section className="panel">
      <h3>{title}</h3>
      <pre className="json-pre" tabIndex={0}>
        {text}
      </pre>
    </section>
  )
}

function ResultView({ result }: { result: PlanResponse }) {
  return (
    <div className="results">
      <div className={`status-pill ${result.ok ? 'ok' : 'bad'}`}>
        {result.ok ? 'Completed without blocking errors' : 'Completed with errors'}
      </div>
      {(result.errors?.length ?? 0) > 0 && (
        <section className="panel error-panel">
          <h3>Errors</h3>
          <ul>
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </section>
      )}
      {(result.warnings?.length ?? 0) > 0 && (
        <section className="panel warn-panel">
          <h3>Warnings</h3>
          <ul>
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}
      {result.final_handbook_summary && (
        <JsonBlock title="Handbook summary" data={result.final_handbook_summary} />
      )}
      {result.travel_profile && <JsonBlock title="Travel profile" data={result.travel_profile} />}
      {result.spot_list && <JsonBlock title="Spot list" data={result.spot_list} />}
      {result.dining_list && <JsonBlock title="Dining list" data={result.dining_list} />}
      {result.itinerary && <JsonBlock title="Itinerary" data={result.itinerary} />}
      {result.final_handbook && <JsonBlock title="Final handbook" data={result.final_handbook} />}
      <JsonBlock title="Metadata" data={result.metadata} />
    </div>
  )
}

export default function App() {
  const [input, setInput] = useState('')

  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth })
  const version = useQuery({ queryKey: ['version'], queryFn: fetchVersion })
  const agents = useQuery({ queryKey: ['agents'], queryFn: fetchAgents })
  const steps = useQuery({ queryKey: ['workflow-steps'], queryFn: fetchWorkflowSteps })

  const plan = useMutation({
    mutationFn: (text: string) => runPlan(text),
  })

  const canSubmit = input.trim().length > 0 && !plan.isPending

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Voyagent</h1>
          <p className="tagline">MVP — travel handbook from natural language</p>
        </div>
        <div className="header-meta">
          <span className={`dot ${health.isSuccess ? 'live' : ''}`} title="API health" />
          <span className="meta-text">
            {health.isLoading && 'Checking API…'}
            {health.isError && 'API unreachable'}
            {health.isSuccess && health.data.status === 'ok' && 'API OK'}
          </span>
          {version.isSuccess && (
            <span className="meta-text muted">
              {version.data.app_name} v{version.data.app_version}
            </span>
          )}
        </div>
      </header>

      <main className="main">
        <section className="panel">
          <h2>Your trip</h2>
          <p className="hint">Describe destination, dates, budget, group size, and preferences. Submit runs the full backend pipeline.</p>
          <textarea
            className="input-area"
            rows={10}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Example: 5-day trip to Paris, June 15–20, 4 people, budget $4000, culture and food, vegetarian…"
            spellCheck={false}
          />
          <div className="actions">
            <button type="button" className="btn primary" disabled={!canSubmit} onClick={() => plan.mutate(input.trim())}>
              {plan.isPending ? 'Planning…' : 'Generate handbook'}
            </button>
          </div>
          {plan.isError && (
            <p className="inline-error" role="alert">
              {plan.error instanceof Error ? plan.error.message : 'Request failed'}
            </p>
          )}
        </section>

        {plan.isSuccess && <ResultView result={plan.data} />}

        <section className="grid-two">
          <div className="panel">
            <h2>Pipeline</h2>
            {steps.isLoading && <p>Loading steps…</p>}
            {steps.isError && <p className="inline-error">Could not load workflow steps.</p>}
            {steps.isSuccess && (
              <ol className="step-list">
                {steps.data.steps.map((s) => (
                  <li key={s.step_index}>
                    <strong>{s.label}</strong>
                    <span className="muted"> → {s.output_field}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="panel">
            <h2>Agents</h2>
            {agents.isLoading && <p>Loading agents…</p>}
            {agents.isError && <p className="inline-error">Could not load agents.</p>}
            {agents.isSuccess && (
              <ul className="agent-list">
                {agents.data.agents.map((a) => (
                  <li key={a.name}>
                    <strong>{a.name}</strong>
                    <div className="muted small">{a.description}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>API base: {import.meta.env.VITE_API_BASE_URL?.trim() || '(dev default http://127.0.0.1:8000)'}</span>
      </footer>
    </div>
  )
}
