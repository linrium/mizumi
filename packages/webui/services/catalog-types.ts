export type Catalog = {
  name: string
  comment?: string
}

export type Schema = {
  name: string
  catalog_name: string
  comment?: string
}

export type TableSummary = {
  name: string
  catalog_name: string
  schema_name: string
  table_type: string
}

export type TableDetail = {
  name: string
  catalog_name: string
  schema_name: string
  table_type: string
  data_source_format?: string
  storage_location?: string
  comment?: string
  columns: Array<{
    name: string
    type_text: string
    type_name?: string
    type_json?: string
    nullable: boolean
    position?: number
    comment?: string
  }>
}

export type PermissionAssignment = {
  principal: string
  privileges?: string[]
}

export type PermissionsResponse = {
  privilege_assignments?: PermissionAssignment[]
}

export type VolumeSummary = {
  name: string
  catalog_name: string
  schema_name: string
  volume_type: string
}

export type VolumeDetail = {
  volume_id: string
  name: string
  catalog_name: string
  schema_name: string
  full_name: string
  volume_type: string
  storage_location?: string
  comment?: string
  owner?: string
  created_at: number
  created_by?: string
}

export type S3Object = {
  key: string
  size: number
  last_modified: string
  etag: string
}

export type ListObjectsResult = {
  objects: S3Object[]
  nextContinuationToken?: string
}

export type RegisteredModelSummary = {
  name: string
  catalog_name: string
  schema_name: string
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
