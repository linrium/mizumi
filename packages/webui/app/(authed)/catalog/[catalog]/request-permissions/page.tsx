"use client"

import { IconDatabase, IconKey, IconShieldLock } from "@tabler/icons-react"
import { useParams } from "next/navigation"
import { CatalogTabs } from "../../catalog-tabs"
import { RequestPermissionsPanel } from "../../request-permissions-panel"

export default function CatalogRequestPermissionsPage() {
  const { catalog } = useParams<{ catalog: string }>()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-6 pt-4">
        <h1 className="font-semibold text-sm">{catalog}</h1>
        <p className="mt-0.5 text-muted-foreground text-xs">
          Request access to this catalog
        </p>
        <CatalogTabs
          tabs={[
            {
              active: false,
              href: `/catalog/${catalog}`,
              icon: IconDatabase,
              label: "schemas",
            },
            {
              active: false,
              href: `/catalog/${catalog}/permissions`,
              icon: IconShieldLock,
              label: "permissions",
            },
            {
              active: true,
              href: `/catalog/${catalog}/request-permissions`,
              icon: IconKey,
              label: "request access",
            },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <RequestPermissionsPanel resource={catalog} scope="catalog" />
      </div>
    </div>
  )
}
