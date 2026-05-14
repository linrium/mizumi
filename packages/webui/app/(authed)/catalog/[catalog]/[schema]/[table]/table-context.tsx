"use client"

import { createContext, useContext } from "react"

export type Column = {
  name: string
  type_text: string
  nullable: boolean
  comment?: string
}
export type TableDetail = {
  name: string
  catalog_name: string
  schema_name: string
  table_type: string
  data_source_format?: string
  storage_location?: string
  comment?: string
  columns: Column[]
}

export const TableContext = createContext<TableDetail | null>(null)

export function useTableDetail() {
  return useContext(TableContext)
}
