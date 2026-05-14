"use client"

import { SecurityIcon } from "@hugeicons/core-free-icons"
import { useParams } from "next/navigation"
import { CatalogTabs } from "../../../catalog-tabs"
import { PermissionsEditor } from "../../../permissions-editor"

export default function SchemaPermissionsPage() {
  const { catalog, schema } = useParams<{ catalog: string; schema: string }>()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-6 py-4 border-b shrink-0">
        <div className="flex items-baseline gap-1.5">
          <h1 className="text-sm font-semibold">{schema}</h1>
          <span className="text-xs text-muted-foreground font-mono">
            {catalog}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage schema permissions
        </p>
        <CatalogTabs
          tabs={[
            {
              href: `/catalog/${catalog}/${schema}`,
              label: "tables",
              active: false,
            },
            {
              href: `/catalog/${catalog}/${schema}/permissions`,
              label: "permissions",
              active: true,
              icon: SecurityIcon,
            },
          ]}
        />
      </div>

      <PermissionsEditor
        resourceType="schema"
        catalog={catalog}
        schema={schema}
        title="Edit schema permissions"
        subtitle={`${catalog}.${schema}`}
      />
    </div>
  )
}
