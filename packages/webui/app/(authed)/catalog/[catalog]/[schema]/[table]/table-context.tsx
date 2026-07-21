"use client"

import { createContext, useContext } from "react"

export interface Column {
  comment?: string
  name: string
  nullable: boolean
  type_text: string
}
export interface TableDetail {
  catalog_name: string
  columns: Column[]
  comment?: string
  data_source_format?: string
  name: string
  schema_name: string
  storage_location?: string
  table_type: string
}

export const TableContext = createContext<TableDetail | null>(null)

export function useTableDetail() {
  return useContext(TableContext)
}
