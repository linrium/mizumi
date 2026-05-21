"use client"

import { RequestPermissionsPanel } from "@/app/(authed)/catalog/request-permissions-panel"
import { useTableDetail } from "../table-context"

export default function TableRequestPermissionsPage() {
  const detail = useTableDetail()
  if (!detail) return null

  const resource = `${detail.catalog_name}.${detail.schema_name}.${detail.name}`
  return <RequestPermissionsPanel resource={resource} scope="table" />
}
