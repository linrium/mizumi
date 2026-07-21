import { apiFetch } from "@/lib/api-client"

export type SemanticStatus =
  | "draft"
  | "validated"
  | "candidate"
  | "certified"
  | "active"
  | "deprecated"
  | "retired"

export type SemanticDefinition = {
  id: string
  namespace: string
  name: string
  object_type: "metric"
  version: number
  status: SemanticStatus
  owner_principal: string
  description: string
  spec: unknown
  time_semantics: unknown | null
  supersedes_definition_id: string | null
  deprecation_deadline: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export type SemanticDependency = {
  id: string
  source_definition_id: string
  target_definition_id: string
  dependency_type: string
  created_at: string
}

export type SemanticPhysicalDependency = {
  id: string
  semantic_definition_id: string
  catalog: string
  schema_name: string
  object_name: string
  object_type: string
  contract_version: number | null
  created_at: string
}

export type SemanticLifecycleEvent = {
  id: string
  definition_id: string
  previous_status: SemanticStatus | null
  new_status: SemanticStatus
  principal: string
  reason: string | null
  created_at: string
}

export type SemanticDefinitionSummary = {
  namespace: string
  name: string
  object_type: "metric"
  owner_principal: string
  description: string
  active_version: number | null
  latest_version: number
  latest_status: SemanticStatus
  version_count: number
  semantic_dependency_count: number
  direct_dependent_count: number
  physical_dependency_count: number
  updated_at: string
}

export type SemanticDefinitionDetail = {
  definition: SemanticDefinition
  dependencies: SemanticDefinition[]
  dependency_edges: SemanticDependency[]
  dependents: SemanticDefinition[]
  physical_dependencies: SemanticPhysicalDependency[]
  lifecycle_history: SemanticLifecycleEvent[]
}

export type CreateSemanticDefinitionBody = {
  namespace: string
  name: string
  object_type?: "metric"
  version: number
  owner_principal: string
  description: string
  spec: unknown
  time_semantics?: unknown | null
  supersedes_version?: number | null
  dependencies?: Array<{
    namespace: string
    name: string
    version: number
    dependency_type?: string
  }>
  physical_dependencies?: Array<{
    catalog: string
    schema_name: string
    object_name: string
    object_type?: string
    contract_version?: number | null
  }>
}

export type SemanticCompareResponse = {
  from: SemanticDefinitionDetail
  to: SemanticDefinitionDetail
  changes: Record<string, boolean>
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
