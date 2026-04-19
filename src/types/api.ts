/**
 * Shapes aligned with FastAPI `PlanResponse` and related JSON payloads.
 * Refine against `http://<api>/docs` or backend `docs/API.md` as the API evolves.
 */

export type JsonObject = Record<string, unknown>

export interface PlanResponse {
  ok: boolean
  travel_profile: JsonObject | null
  spot_list: JsonObject | null
  dining_list: JsonObject | null
  itinerary: JsonObject | null
  itinerary_narrative?: string | null
  final_handbook: JsonObject | null
  final_handbook_summary: JsonObject | null
  errors: string[]
  warnings: string[]
  metadata: JsonObject
}

export type PlanStreamEvent =
  | { type: 'step_running'; step_index: number; label: string; output_field: string }
  | { type: 'step_done'; step_index: number; label: string; output_field: string; error_count: number }
  | { type: 'complete'; result: PlanResponse }
  | { type: 'error'; message: string }

export interface AgentInfoItem {
  name: string
  description: string
  step_index: number
  output_field: string
}

export interface AgentsResponse {
  agents: AgentInfoItem[]
}

export interface WorkflowStepItem {
  step_index: number
  label: string
  output_field: string
  required: boolean
}

export interface WorkflowStepsResponse {
  steps: WorkflowStepItem[]
  pipeline: string[]
}

export interface HealthResponse {
  status: string
}

export interface VersionResponse {
  app_name: string
  app_version: string
  api_version: string
}
