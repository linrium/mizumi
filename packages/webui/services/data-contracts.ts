import { apiFetch } from "@/lib/api-client"
import type {
  SemanticDefinition,
  SemanticDefinitionDetail,
  SemanticDefinitionSummary,
} from "./semantic-registry"

export type DataContractValidationCheck = {
  result: "passed" | "failed"
  check: string
  field?: string
  details?: string
}

export type DataContractValidationResult = {
  valid: boolean
  checked_at: string
  checks: DataContractValidationCheck[]
}

export type DataContractSummary = SemanticDefinitionSummary

export type DataContractDetail = SemanticDefinitionDetail & {
  validation: DataContractValidationResult
}

export type CreateDataContractBody = {
  namespace: string
  name: string
  version: number
  owner_principal: string
  description?: string
  odcs: unknown
  supersedes_version?: number | null
  physical_dependencies?: Array<{
    catalog: string
    schema_name: string
    object_name: string
    object_type?: string
    contract_version?: number | null
  }>
}

export type ImportDataContractFromUcBody = {
  table: string
  version?: number
  owner_principal?: string
  id?: string
  sla_properties?: Array<Record<string, unknown>>
}

export async function listDataContracts(params?: {
  search?: string
  namespace?: string
  status?: string
}): Promise<DataContractSummary[]> {
  const url = new URL("/api/data-contracts", window.location.origin)
  if (params?.search) url.searchParams.set("search", params.search)
  if (params?.namespace) url.searchParams.set("namespace", params.namespace)
  if (params?.status && params.status !== "all") {
    url.searchParams.set("status", params.status)
  }
  const res = await apiFetch(url.toString())
  if (!res.ok) throw await responseError(res)
  const body = await res.json()
  return body.contracts
}

export async function createDataContract(
  body: CreateDataContractBody
): Promise<DataContractDetail> {
  const res = await apiFetch("/api/data-contracts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await responseError(res)
  return normalizeDetail(await res.json())
}

export async function importDataContractFromUc(
  body: ImportDataContractFromUcBody
): Promise<DataContractDetail> {
  const res = await apiFetch("/api/data-contracts/import-from-uc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await responseError(res)
  return normalizeDetail(await res.json())
}

export async function listDataContractVersions(
  namespace: string,
  name: string
): Promise<SemanticDefinition[]> {
  const res = await apiFetch(
    `/api/data-contracts/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/versions`
  )
  if (!res.ok) throw await responseError(res)
  const body = await res.json()
  return body.versions
}

export async function getDataContract(
  namespace: string,
  name: string,
  version: number
): Promise<DataContractDetail> {
  const res = await apiFetch(
    `/api/data-contracts/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/versions/${version}`
  )
  if (!res.ok) throw await responseError(res)
  return normalizeDetail(await res.json())
}

export async function validateDataContract(
  namespace: string,
  name: string,
  version: number,
  metadataOnly = false
): Promise<DataContractValidationResult> {
  const res = await apiFetch(
    `/api/data-contracts/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/versions/${version}/validate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata_only: metadataOnly }),
    }
  )
  if (!res.ok) throw await responseError(res)
  return res.json()
}

export async function activateDataContract(
  namespace: string,
  name: string,
  version: number
): Promise<DataContractDetail> {
  const res = await apiFetch(
    `/api/data-contracts/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/versions/${version}/activate`,
    { method: "POST" }
  )
  if (!res.ok) throw await responseError(res)
  return normalizeDetail(await res.json())
}

export function dataContractYamlUrl(
  namespace: string,
  name: string,
  version: number
) {
  return `/api/data-contracts/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/versions/${version}/odcs.yaml`
}

function normalizeDetail(body: {
  definition: SemanticDefinitionDetail["definition"]
  dependencies: SemanticDefinitionDetail["dependencies"]
  dependency_edges: SemanticDefinitionDetail["dependency_edges"]
  dependents: SemanticDefinitionDetail["dependents"]
  physical_dependencies: SemanticDefinitionDetail["physical_dependencies"]
  lifecycle_history: SemanticDefinitionDetail["lifecycle_history"]
  validation: DataContractValidationResult
}): DataContractDetail {
  return body
}

async function responseError(res: Response) {
  const err = await res.json().catch(() => ({}))
  return new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
}
