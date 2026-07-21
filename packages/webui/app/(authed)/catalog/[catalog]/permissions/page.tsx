"use client"

import { IconDatabase, IconKey, IconShieldLock } from "@tabler/icons-react"
import { useParams } from "next/navigation"
import { CatalogTabs } from "../../catalog-tabs"
import { PermissionsEditor } from "../../permissions-editor"

export default function CatalogPermissionsPage() {
  const { catalog } = useParams<{ catalog: string }>()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-6 pt-4">
        <h1 className="font-semibold text-sm">{catalog}</h1>
        <p className="mt-0.5 text-muted-foreground text-xs">
          Manage catalog permissions
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
              active: true,
              href: `/catalog/${catalog}/permissions`,
              icon: IconShieldLock,
              label: "permissions",
            },
            {
              active: false,
              href: `/catalog/${catalog}/request-permissions`,
              icon: IconKey,
              label: "request access",
            },
          ]}
        />
      </div>

      <PermissionsEditor catalog={catalog} resourceType="catalog" />
    </div>
  )
}
