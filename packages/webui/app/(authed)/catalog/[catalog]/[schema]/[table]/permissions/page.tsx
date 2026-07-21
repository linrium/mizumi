"use client"

import { PermissionsEditor } from "@/app/(authed)/catalog/permissions-editor"
import { useTableDetail } from "../table-context"

export default function TablePermissionsPage() {
  const detail = useTableDetail()

  if (!detail) {
    return null
  }

  return (
    <PermissionsEditor
      catalog={detail.catalog_name}
      resourceType="table"
      schema={detail.schema_name}
      table={detail.name}
    />
  )
}
