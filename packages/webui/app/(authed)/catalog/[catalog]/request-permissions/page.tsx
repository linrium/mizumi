"use client"

import { SecurityIcon } from "@hugeicons/core-free-icons"
import { useParams } from "next/navigation"
import { CatalogTabs } from "../../catalog-tabs"
import { RequestPermissionsPanel } from "../../request-permissions-panel"

export default function CatalogRequestPermissionsPage() {
  const { catalog } = useParams<{ catalog: string }>()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-6 pt-4 shrink-0">
        <h1 className="text-sm font-semibold">{catalog}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Request access to this catalog
        </p>
        <CatalogTabs
          tabs={[
            { href: `/catalog/${catalog}`, label: "schemas", active: false },
            {
              href: `/catalog/${catalog}/permissions`,
              label: "permissions",
              active: false,
              icon: SecurityIcon,
            },
            {
              href: `/catalog/${catalog}/request-permissions`,
              label: "request access",
              active: true,
              icon: SecurityIcon,
            },
          ]}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <RequestPermissionsPanel resource={catalog} scope="catalog" />
      </div>
    </div>
  )
}
