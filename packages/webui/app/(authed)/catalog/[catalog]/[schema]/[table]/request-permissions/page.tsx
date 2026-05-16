"use client"

import { PermissionsEditor } from "@/app/(authed)/catalog/permissions-editor"
import { useTableDetail } from "../table-context"

export default function TableRequestPermissionsPage() {
  const detail = useTableDetail()

  if (!detail) return null

  return (
    <PermissionsEditor
      resourceType="table"
      catalog={detail.catalog_name}
      schema={detail.schema_name}
      table={detail.name}
    />
  )
}
