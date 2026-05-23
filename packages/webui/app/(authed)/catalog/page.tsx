import { IconBinaryTree2, IconDatabase, IconTable } from "@tabler/icons-react"

export default function CatalogIndexPage() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center rounded-xl border border-dashed bg-card/60 px-8 py-10 text-center">
        <div className="mb-4 flex items-center gap-2 rounded-full border bg-muted/60 px-3 py-1.5 text-muted-foreground">
          <IconDatabase size={14} />
          <IconBinaryTree2 size={14} />
          <IconTable size={14} />
        </div>
        <h1 className="text-sm font-semibold">Browse the catalog tree</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Select a catalog, schema, or table from the left sidebar to inspect
          structure, preview metadata, or manage access.
        </p>
      </div>
    </div>
  )
}
