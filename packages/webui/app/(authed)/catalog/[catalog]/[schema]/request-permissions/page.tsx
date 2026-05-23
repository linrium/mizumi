"use client"

import { IconKey, IconShieldLock, IconTableOptions } from "@tabler/icons-react"
import { useParams } from "next/navigation"
import { CatalogTabs } from "../../../catalog-tabs"
import { RequestPermissionsPanel } from "../../../request-permissions-panel"

export default function SchemaRequestPermissionsPage() {
  const { catalog, schema } = useParams<{ catalog: string; schema: string }>()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-6 pt-4 shrink-0">
        <div className="flex items-baseline gap-1.5">
          <h1 className="text-sm font-semibold">{schema}</h1>
          <span className="text-xs text-muted-foreground font-mono">
            {catalog}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Request access to this schema
        </p>
        <CatalogTabs
          tabs={[
            {
              href: `/catalog/${catalog}/${schema}`,
              label: "tables",
              active: false,
              icon: IconTableOptions,
            },
            {
              href: `/catalog/${catalog}/${schema}/permissions`,
              label: "permissions",
              active: false,
              icon: IconShieldLock,
            },
            {
              href: `/catalog/${catalog}/${schema}/request-permissions`,
              label: "request access",
              active: true,
              icon: IconKey,
            },
          ]}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <RequestPermissionsPanel
          resource={`${catalog}.${schema}`}
          scope="schema"
        />
      </div>
    </div>
  )
}
