import { apiFetch } from "@/lib/api-client"

export type SemanticStatus =
  | "draft"
  | "validated"
  | "candidate"
  | "certified"
  | "active"
  | "deprecated"
  | "retired"

export interface SemanticDefinition {
  created_at: string
  created_by: string
  deprecation_deadline: string | null
  description: string
  id: string
  name: string
  namespace: string
  object_type: "metric"
  owner_principal: string
  spec: unknown
  status: SemanticStatus
  supersedes_definition_id: string | null
  time_semantics: unknown | null
  updated_at: string
  version: number
}

export interface SemanticDependency {
  created_at: string
  dependency_type: string
  id: string
  source_definition_id: string
  target_definition_id: string
}

export interface SemanticPhysicalDependency {
  catalog: string
  contract_version: number | null
  created_at: string
  id: string
  object_name: string
  object_type: string
  schema_name: string
  semantic_definition_id: string
}

export interface SemanticLifecycleEvent {
  created_at: string
  definition_id: string
  id: string
  new_status: SemanticStatus
  previous_status: SemanticStatus | null
  principal: string
  reason: string | null
}

export interface SemanticDefinitionSummary {
  active_version: number | null
  description: string
  direct_dependent_count: number
  latest_status: SemanticStatus
  latest_version: number
  name: string
  namespace: string
  object_type: "metric"
  owner_principal: string
  physical_dependency_count: number
  semantic_dependency_count: number
  updated_at: string
  version_count: number
}

export interface SemanticDefinitionDetail {
  definition: SemanticDefinition
  dependencies: SemanticDefinition[]
  dependency_edges: SemanticDependency[]
  dependents: SemanticDefinition[]
  lifecycle_history: SemanticLifecycleEvent[]
  physical_dependencies: SemanticPhysicalDependency[]
}

export interface CreateSemanticDefinitionBody {
  dependencies?: Array<{
    namespace: string
    name: string
    version: number
    dependency_type?: string
  }>
  description: string
  name: string
  namespace: string
  object_type?: "metric"
  owner_principal: string
  physical_dependencies?: Array<{
    catalog: string
    schema_name: string
    object_name: string
    object_type?: string
    contract_version?: number | null
  }>
  spec: unknown
  supersedes_version?: number | null
  time_semantics?: unknown | null
  version: number
}

export interface SemanticCompareResponse {
  changes: Record<string, boolean>
  from: SemanticDefinitionDetail
  to: SemanticDefinitionDetail
}

export async function listSemanticDefinitions(params?: {
  search?: string
  namespace?: string
  status?: string
}): Promise<SemanticDefinitionSummary[]> {
  const url = new URL(
    "/api/semantic-registry/definitions",
    window.location.origin
  )
  if (params?.search) {
    url.searchParams.set("search", params.search)
  }
  if (params?.namespace) {
    url.searchParams.set("namespace", params.namespace)
  }
  if (params?.status && params.status !== "all") {
    url.searchParams.set("status", params.status)
  }
  const res = await apiFetch(url.toString())
  if (!res.ok) {
    throw await responseError(res)
  }
  const body = await res.json()
  return body.definitions
}

export async function createSemanticDefinition(
  body: CreateSemanticDefinitionBody
): Promise<SemanticDefinitionDetail> {
  const res = await apiFetch("/api/semantic-registry/definitions", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  if (!res.ok) {
    throw await responseError(res)
  }
  return res.json()
}

export async function createSemanticVersion(
  namespace: string,
  name: string,
  body: CreateSemanticDefinitionBody
): Promise<SemanticDefinitionDetail> {
  const res = await apiFetch(
    `/api/semantic-registry/definitions/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/versions`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  )
  if (!res.ok) {
    throw await responseError(res)
  }
  return res.json()
}

export async function listSemanticVersions(
  namespace: string,
  name: string
): Promise<SemanticDefinition[]> {
  const res = await apiFetch(
    `/api/semantic-registry/definitions/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
  )
  if (!res.ok) {
    throw await responseError(res)
  }
  const body = await res.json()
  return body.versions
}

export async function getSemanticDefinition(
  namespace: string,
  name: string,
  version: number
): Promise<SemanticDefinitionDetail> {
  const res = await apiFetch(
    `/api/semantic-registry/definitions/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/versions/${version}`
  )
  if (!res.ok) {
    throw await responseError(res)
  }
  return res.json()
}

export async function transitionSemanticStatus(
  namespace: string,
  name: string,
  version: number,
  status: SemanticStatus,
  reason?: string
): Promise<SemanticDefinitionDetail> {
  const res = await apiFetch(
    `/api/semantic-registry/definitions/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/versions/${version}/status`,
    {
      body: JSON.stringify({ reason: reason ?? null, status }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    }
  )
  if (!res.ok) {
    throw await responseError(res)
  }
  return res.json()
}

export async function compareSemanticVersions(
  namespace: string,
  name: string,
  from: number,
  to: number
): Promise<SemanticCompareResponse> {
  const url = new URL(
    `/api/semantic-registry/definitions/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/compare`,
    window.location.origin
  )
  url.searchParams.set("from", String(from))
  url.searchParams.set("to", String(to))
  const res = await apiFetch(url.toString())
  if (!res.ok) {
    throw await responseError(res)
  }
  return res.json()
}

async function responseError(res: Response) {
  const err = await res.json().catch(() => ({}))
  return new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
}
