export interface Catalog {
  comment?: string
  name: string
}

export interface Schema {
  catalog_name: string
  comment?: string
  name: string
}

export interface TableSummary {
  catalog_name: string
  name: string
  schema_name: string
  table_type: string
}

export interface TableDetail {
  catalog_name: string
  columns: Array<{
    name: string
    type_text: string
    type_name?: string
    type_json?: string
    nullable: boolean
    position?: number
    comment?: string
  }>
  comment?: string
  data_source_format?: string
  name: string
  schema_name: string
  storage_location?: string
  table_type: string
}

export interface PermissionAssignment {
  principal: string
  privileges?: string[]
}

export interface PermissionsResponse {
  privilege_assignments?: PermissionAssignment[]
}

export interface VolumeSummary {
  catalog_name: string
  name: string
  schema_name: string
  volume_type: string
}

export interface VolumeDetail {
  catalog_name: string
  comment?: string
  created_at: number
  created_by?: string
  full_name: string
  name: string
  owner?: string
  schema_name: string
  storage_location?: string
  volume_id: string
  volume_type: string
}

export interface S3Object {
  etag: string
  key: string
  last_modified: string
  size: number
}

export interface ListObjectsResult {
  nextContinuationToken?: string
  objects: S3Object[]
}

export interface RegisteredModelSummary {
  catalog_name: string
  comment?: string
  created_at?: number
  created_by?: string
  full_name?: string
  id?: string
  name: string
  owner?: string
  schema_name: string
  storage_location?: string
  updated_at?: number
  updated_by?: string
}

export type RegisteredModelDetail = RegisteredModelSummary

export interface ModelVersionSummary {
  catalog_name?: string
  comment?: string
  created_at?: number
  created_by?: string
  id?: string
  model_name?: string
  run_id?: string
  schema_name?: string
  source?: string
  status?: string
  storage_location?: string
  updated_at?: number
  updated_by?: string
  version?: number
}

export type ResourceType = "catalog" | "schema" | "table"

export class CatalogApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "CatalogApiError"
    this.status = status
  }
}
