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

export type MlflowTag = {
  key: string
  value: string
}

export type MlflowExperiment = {
  experiment_id: string
  name: string
  artifact_location: string
  lifecycle_stage: string
  creation_time?: number
  last_update_time?: number
  tags?: MlflowTag[]
}

export type MlflowMetric = {
  key: string
  value: number
  timestamp: number
  step: number
}

export type MlflowParam = {
  key: string
  value: string
}

export type MlflowRunData = {
  metrics?: MlflowMetric[]
  params?: MlflowParam[]
  tags?: MlflowTag[]
}

export type MlflowRunInfo = {
  run_id: string
  run_name?: string
  experiment_id: string
  status: "RUNNING" | "SCHEDULED" | "FINISHED" | "FAILED" | "KILLED"
  start_time?: number
  end_time?: number
  artifact_uri?: string
  lifecycle_stage: string
}

export type MlflowRun = {
  info: MlflowRunInfo
  data: MlflowRunData
}

export type MlflowTrace = {
  request_id: string
  experiment_id: string
  timestamp_ms: number
  execution_time_ms?: number
  status: string
  tags?: MlflowTag[]
}

export async function searchExperiments() {
  return mlflowFetch<{ experiments?: MlflowExperiment[] }>(
    "/api/2.0/mlflow/experiments/search?max_results=100",
  )
}

export async function searchRuns(experimentIds: string[]) {
  return mlflowFetch<{ runs?: MlflowRun[]; next_page_token?: string }>(
    "/api/2.0/mlflow/runs/search",
    {
      method: "POST",
      body: JSON.stringify({
        experiment_ids: experimentIds,
        max_results: 50,
        order_by: ["start_time DESC"],
      }),
    },
  )
}

export async function getRun(runId: string) {
  return mlflowFetch<{ run: MlflowRun }>(
    `/api/2.0/mlflow/runs/get?run_id=${encodeURIComponent(runId)}`,
  )
}

export async function listTraces(experimentId: string) {
  return mlflowFetch<{ traces?: MlflowTrace[] }>(
    `/api/2.0/mlflow/traces?experiment_id=${encodeURIComponent(experimentId)}&max_results=50`,
  )
}
