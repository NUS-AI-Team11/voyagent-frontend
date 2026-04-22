import type {
  AgentsResponse,
  HealthResponse,
  PlanResponse,
  PlanStreamEvent,
  VersionResponse,
  WorkflowStepsResponse,
} from '../types/api'

function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err.trim()) return err
  return 'Unknown error'
}

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

/**
 * Streamed planning: SSE `data:` lines with step progress, then a `complete` event carrying PlanResponse.
 */
export async function runPlanStream(
  userInput: string,
  onEvent: (event: PlanStreamEvent) => void,
): Promise<PlanResponse> {
  const apiBase = getApiBase()
  let res: Response
  try {
    res = await fetch(`${apiBase}/api/v1/plan/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        user_input: userInput,
        fail_fast: true,
        print_summary: false,
      }),
    })
  } catch (err) {
    const msg = toErrorMessage(err)
    throw new Error(
      `Network error while calling ${apiBase}/api/v1/plan/stream: ${msg}. ` +
        'Check backend URL, CORS settings, server health, and security-group/firewall rules.',
    )
  }
  if (!res.ok) {
    const text = await res.text()
    let body: unknown
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }
    const msg =
      typeof body === 'object' && body !== null && 'detail' in body
        ? JSON.stringify((body as { detail: unknown }).detail)
        : text.slice(0, 200)
    throw new Error(`HTTP ${res.status}: ${msg}`)
  }
  const reader = res.body?.getReader()
  if (!reader) {
    throw new Error('No response body from plan stream')
  }
  const decoder = new TextDecoder()
  let buffer = ''
  let final: PlanResponse | null = null
  while (true) {
    let chunk
    try {
      chunk = await reader.read()
    } catch (err) {
      const msg = toErrorMessage(err)
      throw new Error(`Stream connection dropped unexpectedly: ${msg}`)
    }
    const { done, value } = chunk
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const jsonText = trimmed.slice(5).trim()
        if (!jsonText) continue
        let data: PlanStreamEvent
        try {
          data = JSON.parse(jsonText) as PlanStreamEvent
        } catch {
          throw new Error('Invalid JSON in plan stream')
        }
        onEvent(data)
        if (data.type === 'complete') {
          final = data.result
        }
        if (data.type === 'error') {
          throw new Error(data.message)
        }
      }
    }
    if (done) break
  }
  if (!final) {
    throw new Error('Stream ended without a complete result')
  }
  return final
}
