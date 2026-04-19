import type {
  AgentsResponse,
  HealthResponse,
  PlanResponse,
  VersionResponse,
  WorkflowStepsResponse,
} from '../types/api'

export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL
  if (raw != null && String(raw).trim() !== '') {
    return String(raw).replace(/\/$/, '')
  }
  if (import.meta.env.DEV) {
    return 'http://127.0.0.1:8000'
  }
  throw new Error(
    'VITE_API_BASE_URL is not set. Create .env.local from .env.example before building for production.',
  )
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  const text = await res.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`Invalid JSON from server (HTTP ${res.status})`)
  }
  if (!res.ok) {
    const msg =
      typeof body === 'object' && body !== null && 'detail' in body
        ? JSON.stringify((body as { detail: unknown }).detail)
        : text.slice(0, 200)
    throw new Error(`HTTP ${res.status}: ${msg}`)
  }
  return body
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${getApiBase()}/api/v1/health`)
  return parseJsonOrThrow(res) as Promise<HealthResponse>
}

export async function fetchVersion(): Promise<VersionResponse> {
  const res = await fetch(`${getApiBase()}/api/v1/version`)
  return parseJsonOrThrow(res) as Promise<VersionResponse>
}

export async function fetchAgents(): Promise<AgentsResponse> {
  const res = await fetch(`${getApiBase()}/api/v1/agents`)
  return parseJsonOrThrow(res) as Promise<AgentsResponse>
}

export async function fetchWorkflowSteps(): Promise<WorkflowStepsResponse> {
  const res = await fetch(`${getApiBase()}/api/v1/workflow/steps`)
  return parseJsonOrThrow(res) as Promise<WorkflowStepsResponse>
}

export async function runPlan(userInput: string): Promise<PlanResponse> {
  const res = await fetch(`${getApiBase()}/api/v1/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_input: userInput,
      fail_fast: true,
      print_summary: false,
    }),
  })
  return parseJsonOrThrow(res) as Promise<PlanResponse>
}
