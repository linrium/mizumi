import { SecurityIcon } from "@hugeicons/core-free-icons"
import { CatalogTabs } from "../../catalog-tabs"
import { CatalogRequestPermissionsForm } from "../../request-permissions-form"
import { getServerSession } from "@/lib/auth"

type CatalogRequestPermissionsPageProps = {
  params: Promise<{
    catalog: string
  }>
}

export default async function CatalogRequestPermissionsPage({
  params,
}: CatalogRequestPermissionsPageProps) {
  const { catalog } = await params
  const session = await getServerSession()
  const currentPrincipal =
    session?.email ?? session?.preferredUsername ?? session?.userId ?? ""

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b px-6 py-4 shrink-0">
        <h1 className="text-sm font-semibold">{catalog}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Request catalog permissions
        </p>
        <CatalogTabs
          tabs={[
            {
              href: `/catalog/${catalog}`,
              label: "schemas",
              active: false,
            },
            {
              href: `/catalog/${catalog}/permissions`,
              label: "permissions",
              active: false,
              icon: SecurityIcon,
            },
            {
              href: `/catalog/${catalog}/request-permissions`,
              label: "request permissions",
              active: true,
              icon: SecurityIcon,
            },
          ]}
        />
      </div>

      <CatalogRequestPermissionsForm
        catalog={catalog}
        currentPrincipal={currentPrincipal}
      />
    </div>
  )
}
