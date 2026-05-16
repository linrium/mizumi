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

export type ResourceType = "catalog" | "schema" | "table"

export class CatalogApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "CatalogApiError"
    this.status = status
  }
}
