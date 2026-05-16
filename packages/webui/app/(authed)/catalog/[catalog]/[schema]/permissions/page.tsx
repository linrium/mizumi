"use client"

import {Key01Icon, SecurityIcon} from "@hugeicons/core-free-icons"
import { useParams } from "next/navigation"
import { CatalogTabs } from "../../../catalog-tabs"
import { PermissionsEditor } from "../../../permissions-editor"

export default function SchemaPermissionsPage() {
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
            {
              href: `/catalog/${catalog}/${schema}/request-permissions`,
              label: "request permissions",
              active: false,
              icon: Key01Icon,
            },
          ]}
        />
      </div>

      <PermissionsEditor
        resourceType="schema"
        catalog={catalog}
        schema={schema}
      />
    </div>
  )
}
