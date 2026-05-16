"use server"

import {
  getCatalogs,
  getPermissions,
  getSchemas,
  getTable,
  getTables,
  patchPermissions,
} from "@/services/catalog"

export async function getCatalogsAction() {
  return getCatalogs()
}

export async function getSchemasAction(catalog: string) {
  return getSchemas(catalog)
}

export async function getTablesAction(catalog: string, schema: string) {
  return getTables(catalog, schema)
}

export async function getTableAction(
  catalog: string,
  schema: string,
  table: string,
) {
  return getTable(catalog, schema, table)
}

export async function getPermissionsAction(
  resourceType: "catalog" | "schema" | "table",
  catalog: string,
  schema?: string,
  table?: string,
) {
  return getPermissions(resourceType, catalog, schema, table)
}

export async function patchPermissionsAction(input: {
  resourceType: "catalog" | "schema" | "table"
  catalog: string
  schema?: string
  table?: string
  principal: string
  add: string[]
  remove: string[]
}) {
  return patchPermissions(input)
}
