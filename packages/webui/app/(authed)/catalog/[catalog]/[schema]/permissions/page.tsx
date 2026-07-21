"use client"

import { IconKey, IconShieldLock, IconTableOptions } from "@tabler/icons-react"
import { useParams } from "next/navigation"
import { CatalogTabs } from "../../../catalog-tabs"
import { PermissionsEditor } from "../../../permissions-editor"

export default function SchemaPermissionsPage() {
  const { catalog, schema } = useParams<{ catalog: string; schema: string }>()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-6 pt-4">
        <div className="flex items-baseline gap-1.5">
          <h1 className="font-semibold text-sm">{schema}</h1>
          <span className="font-mono text-muted-foreground text-xs">
            {catalog}
          </span>
        </div>
        <p className="mt-0.5 text-muted-foreground text-xs">
          Manage schema permissions
        </p>
        <CatalogTabs
          tabs={[
            {
              active: false,
              href: `/catalog/${catalog}/${schema}`,
              icon: IconTableOptions,
              label: "tables",
            },
            {
              active: true,
              href: `/catalog/${catalog}/${schema}/permissions`,
              icon: IconShieldLock,
              label: "permissions",
            },
            {
              active: false,
              href: `/catalog/${catalog}/${schema}/request-permissions`,
              icon: IconKey,
              label: "request access",
            },
          ]}
        />
      </div>

      <PermissionsEditor
        catalog={catalog}
        resourceType="schema"
        schema={schema}
      />
    </div>
  )
}
