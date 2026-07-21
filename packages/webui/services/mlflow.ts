import { getServerSession } from "@/lib/auth"

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4000"

async function mlflowFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getServerSession()
  const headers: Record<string, string> = {}

  if (session?.idToken) {
    headers.Authorization = `Bearer ${session.idToken}`
  }
  if (init?.body) {
    headers["Content-Type"] = "application/json"
  }

  const res = await fetch(`${API_BASE}/mlflow${path}`, {
    cache: "no-store",
    headers,
    ...init,
  })

  if (!res.ok) {
    throw new Error(`MLflow ${res.status}: ${res.statusText}`)
  }

  return res.json() as Promise<T>
}

export interface MlflowTag {
  key: string
  value: string
}

export interface MlflowExperiment {
  artifact_location: string
  creation_time?: number
  experiment_id: string
  last_update_time?: number
  lifecycle_stage: string
  name: string
  tags?: MlflowTag[]
}

export interface MlflowMetric {
  key: string
  step: number
  timestamp: number
  value: number
}

export interface MlflowParam {
  key: string
  value: string
}

export interface MlflowRunData {
  metrics?: MlflowMetric[]
  params?: MlflowParam[]
  tags?: MlflowTag[]
}

export interface MlflowRunInfo {
  artifact_uri?: string
  end_time?: number
  experiment_id: string
  lifecycle_stage: string
  run_id: string
  run_name?: string
  start_time?: number
  status: "RUNNING" | "SCHEDULED" | "FINISHED" | "FAILED" | "KILLED"
}

export interface MlflowRun {
  data: MlflowRunData
  info: MlflowRunInfo
}

export interface MlflowTrace {
  execution_time_ms?: number
  experiment_id: string
  request_id: string
  status: string
  tags?: MlflowTag[]
  timestamp_ms: number
}

export interface MlflowRegisteredModelAlias {
  alias: string
  version: string
}

export interface MlflowModelVersion {
  creation_timestamp?: number
  current_stage?: string
  description?: string
  last_updated_timestamp?: number
  name: string
  run_id?: string
  run_link?: string
  source?: string
  status?: string
  version: string
}

export interface MlflowRegisteredModel {
  aliases?: MlflowRegisteredModelAlias[]
  creation_timestamp?: number
  last_updated_timestamp?: number
  latest_versions?: MlflowModelVersion[]
  name: string
}

export interface MlflowLoggedModelInfo {
  artifact_uri?: string
  creation_timestamp_ms?: number
  experiment_id: string
  last_updated_timestamp_ms?: number
  model_id: string
  model_type?: string
  name: string
  source_run_id?: string
  status?: string
  tags?: MlflowTag[]
}

export type MlflowLoggedModelMetric = MlflowMetric & {
  model_id?: string
  run_id?: string
}

export interface MlflowLoggedModelData {
  metrics?: MlflowLoggedModelMetric[]
  params?: MlflowParam[]
}

export interface MlflowLoggedModel {
  data?: MlflowLoggedModelData
  info: MlflowLoggedModelInfo
}

export async function searchExperiments() {
  return mlflowFetch<{ experiments?: MlflowExperiment[] }>(
    "/api/2.0/mlflow/experiments/search?max_results=100"
  )
}

export async function searchRegisteredModels() {
  return mlflowFetch<{ registered_models?: MlflowRegisteredModel[] }>(
    "/api/2.0/mlflow/registered-models/search?filter=&max_results=25&order_by=name+ASC"
  )
}

export async function searchLoggedModels() {
  return mlflowFetch<{ models?: MlflowLoggedModel[] }>(
    "/api/2.0/mlflow/logged-models/search",
    {
      body: JSON.stringify({
        experiment_ids: ["1"],
        order_by: [
          {
            ascending: false,
            field_name: "creation_time",
          },
        ],
      }),
      method: "POST",
    }
  )
}

export async function searchRuns(
  experimentIds: string[],
  options?: { registeredModelUri?: string }
) {
  return mlflowFetch<{ runs?: MlflowRun[]; next_page_token?: string }>(
    "/api/2.0/mlflow/runs/search",
    {
      body: JSON.stringify({
        experiment_ids: experimentIds,
        ...(options?.registeredModelUri
          ? {
              filter: `tags.registered_model_uri = '${options.registeredModelUri.replaceAll("'", "\\'")}'`,
            }
          : {}),
        max_results: 50,
        order_by: ["start_time DESC"],
      }),
      method: "POST",
    }
  )
}

export async function getRun(runId: string) {
  return mlflowFetch<{ run: MlflowRun }>(
    `/api/2.0/mlflow/runs/get?run_id=${encodeURIComponent(runId)}`
  )
}

export async function listTraces(experimentId: string) {
  return mlflowFetch<{ traces?: MlflowTrace[] }>(
    `/api/2.0/mlflow/traces?experiment_id=${encodeURIComponent(experimentId)}&max_results=50`
  )
}
