"use client"

import { IconBook2, IconCarFan, IconChevronRight, IconDatabase, IconFolder, IconTable } from "@tabler/icons-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { Catalog, RegisteredModelSummary, Schema, TableSummary, VolumeSummary } from "@/services/catalog-types"
import { getCatalogsAction, getModelsAction, getSchemasAction, getTablesAction, getVolumesAction } from "./actions"

export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sidebarRef = useRef<HTMLDivElement | null>(null)

  const [catalogs, setCatalogs] = useState<Catalog[]>([])
  const [schemas, setSchemas] = useState<Record<string, Schema[]>>({})
  const [tables, setTables] = useState<Record<string, TableSummary[]>>({})
  const [volumes, setVolumes] = useState<Record<string, VolumeSummary[]>>({})
  const [models, setModels] = useState<Record<string, RegisteredModelSummary[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(360)
  const parts = pathname.split("/").filter(Boolean)
  const activeCat = parts[1]
  const resourceParts = parts.slice(2)
  const activeSch =
    resourceParts[0] &&
    resourceParts[0] !== "permissions" &&
    resourceParts[0] !== "request-permissions"
      ? resourceParts[0]
      : undefined
  const activeTbl =
    resourceParts[1] &&
    resourceParts[1] !== "permissions" &&
    resourceParts[1] !== "request-permissions" &&
    resourceParts[1] !== "preview" &&
    resourceParts[1] !== "volumes" &&
    resourceParts[1] !== "models"
      ? resourceParts[1]
      : undefined
  const activeVol =
    resourceParts[1] === "volumes" && resourceParts[2] ? resourceParts[2] : undefined
  const activeMod =
    resourceParts[1] === "models" && resourceParts[2] ? resourceParts[2] : undefined
  const activeItemClass =
    "bg-primary/12 text-foreground font-medium ring-1 ring-primary/20"
  const activeIconClass = "text-primary"

  useEffect(() => {
    getCatalogsAction()
      .then((data) => setCatalogs(data.catalogs ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!activeCat) return

    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(activeCat)
      if (activeSch) next.add(`${activeCat}.${activeSch}`)
      return next
    })

    if (!schemas[activeCat]) {
      void getSchemasAction(activeCat).then((data) => {
        setSchemas((prev) => ({ ...prev, [activeCat]: data.schemas ?? [] }))
      })
    }
  }, [activeCat, activeSch, schemas])

  useEffect(() => {
    if (!activeCat || !activeSch) return

    const key = `${activeCat}.${activeSch}`
    if (tables[key]) return

    void Promise.all([
      getTablesAction(activeCat, activeSch),
      getVolumesAction(activeCat, activeSch).catch(() => ({ volumes: [] as VolumeSummary[] })),
      getModelsAction(activeCat, activeSch).catch(() => ({ registered_models: [] as RegisteredModelSummary[] })),
    ]).then(([tablesData, volumesData, modelsData]) => {
      setTables((prev) => ({ ...prev, [key]: tablesData.tables ?? [] }))
      setVolumes((prev) => ({ ...prev, [key]: volumesData.volumes ?? [] }))
      setModels((prev) => ({ ...prev, [key]: modelsData.registered_models ?? [] }))
    })
  }, [activeCat, activeSch, tables])

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleCatalog(cat: string) {
    toggle(cat)
    router.push(`/catalog/${cat}`)
    if (!schemas[cat]) {
      const data = await getSchemasAction(cat)
      setSchemas((prev) => ({ ...prev, [cat]: data.schemas ?? [] }))
    }
  }

  async function handleSchema(cat: string, sch: string) {
    const key = `${cat}.${sch}`
    toggle(key)
    router.push(`/catalog/${cat}/${sch}`)
    if (!tables[key]) {
      const [tablesData, volumesData, modelsData] = await Promise.all([
        getTablesAction(cat, sch),
        getVolumesAction(cat, sch).catch(() => ({ volumes: [] as VolumeSummary[] })),
        getModelsAction(cat, sch).catch(() => ({ registered_models: [] as RegisteredModelSummary[] })),
      ])
      setTables((prev) => ({ ...prev, [key]: tablesData.tables ?? [] }))
      setVolumes((prev) => ({ ...prev, [key]: volumesData.volumes ?? [] }))
      setModels((prev) => ({ ...prev, [key]: modelsData.registered_models ?? [] }))
    }
  }

  function handleTable(cat: string, sch: string, tbl: string) {
    router.push(`/catalog/${cat}/${sch}/${tbl}`)
  }

  function handleVolume(cat: string, sch: string, vol: string) {
    router.push(`/catalog/${cat}/${sch}/volumes/${vol}`)
  }

  function handleModel(cat: string, sch: string, mod: string) {
    router.push(`/catalog/${cat}/${sch}/models/${mod}`)
  }

  function startResize(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()

    const minWidth = 300
    const maxWidth = 640

    function onMouseMove(moveEvent: MouseEvent) {
      const nextWidth = sidebarRef.current
        ? moveEvent.clientX - sidebarRef.current.getBoundingClientRect().left
        : moveEvent.clientX
      setSidebarWidth(Math.min(maxWidth, Math.max(minWidth, nextWidth)))
    }

    function onMouseUp() {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }

    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
  }

  function resizeBy(delta: number) {
    setSidebarWidth((current) => Math.min(640, Math.max(300, current + delta)))
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div
        ref={sidebarRef}
        className="relative shrink-0 border-r flex flex-col overflow-hidden select-none"
        style={{ width: sidebarWidth }}
      >
        <div className="flex-1 overflow-y-auto py-1">
          {loading && (
            <p className="px-4 py-3 text-xs text-muted-foreground">Loading…</p>
          )}

          {catalogs.map((cat) => {
            const catOpen = expanded.has(cat.name)
            const catActive = activeCat === cat.name && !activeSch

            return (
              <div key={cat.name}>
                <button
                  type="button"
                  onClick={() => handleCatalog(cat.name)}
                  className={cn(
                    "flex w-full items-center gap-1.5 pl-2 pr-3 py-1 text-sm hover:bg-accent/50 transition-colors text-left",
                    catActive && activeItemClass,
                  )}
                >
                  <IconChevronRight
                    aria-hidden="true"
                    size={14}
                    className={cn(
                      "shrink-0 text-muted-foreground transition-transform",
                      catOpen && "rotate-90",
                    )}
                  />
                  <IconBook2
                    size={15}
                    className={cn(
                      "shrink-0 text-muted-foreground",
                      catActive && activeIconClass,
                    )}
                  />
                  <span className="truncate flex-1">{cat.name}</span>
                </button>

                {catOpen &&
                  (schemas[cat.name] ?? []).map((sch) => {
                    const schKey = `${cat.name}.${sch.name}`
                    const schOpen = expanded.has(schKey)
                    const schActive =
                      activeCat === cat.name &&
                      activeSch === sch.name &&
                      !activeTbl &&
                      !activeVol &&
                      !activeMod

                    return (
                      <div key={schKey}>
                        <button
                          type="button"
                          onClick={() => handleSchema(cat.name, sch.name)}
                          className={cn(
                            "flex w-full items-center gap-1.5 pl-6 pr-3 py-1 text-sm hover:bg-accent/50 transition-colors text-left",
                            schActive && activeItemClass,
                          )}
                        >
                          <IconChevronRight
                            aria-hidden="true"
                            size={14}
                            className={cn(
                              "shrink-0 text-muted-foreground transition-transform",
                              schOpen && "rotate-90",
                            )}
                          />
                          <IconDatabase
                            size={15}
                            className={cn(
                              "shrink-0 text-muted-foreground",
                              schActive && activeIconClass,
                            )}
                          />
                          <span className="truncate flex-1">{sch.name}</span>
                        </button>

                        {schOpen && (
                          <>
                            {(tables[schKey] ?? []).map((tbl) => {
                              const tblActive =
                                activeCat === cat.name &&
                                activeSch === sch.name &&
                                activeTbl === tbl.name

                              return (
                                <button
                                  key={tbl.name}
                                  type="button"
                                  onClick={() =>
                                    handleTable(cat.name, sch.name, tbl.name)
                                  }
                                  className={cn(
                                    "flex w-full items-center gap-1.5 pl-11 pr-3 py-1 text-sm hover:bg-accent/50 transition-colors text-left",
                                    tblActive && activeItemClass,
                                  )}
                                >
                                  <IconTable
                                    size={15}
                                    className={cn(
                                      "shrink-0 text-muted-foreground",
                                      tblActive && activeIconClass,
                                    )}
                                  />
                                  <span className="truncate">{tbl.name}</span>
                                </button>
                              )
                            })}

                            {(volumes[schKey] ?? []).map((vol) => {
                              const volActive =
                                activeCat === cat.name &&
                                activeSch === sch.name &&
                                activeVol === vol.name

                              return (
                                <button
                                  key={`vol:${vol.name}`}
                                  type="button"
                                  onClick={() =>
                                    handleVolume(cat.name, sch.name, vol.name)
                                  }
                                  className={cn(
                                    "flex w-full items-center gap-1.5 pl-11 pr-3 py-1 text-sm hover:bg-accent/50 transition-colors text-left",
                                    volActive && activeItemClass,
                                  )}
                                >
                                  <IconFolder
                                    size={15}
                                    className={cn(
                                      "shrink-0 text-muted-foreground",
                                      volActive && activeIconClass,
                                    )}
                                  />
                                  <span className="truncate">{vol.name}</span>
                                </button>
                              )
                            })}

                            {(models[schKey] ?? []).map((mod) => {
                              const modActive =
                                activeCat === cat.name &&
                                activeSch === sch.name &&
                                activeMod === mod.name

                              return (
                                <button
                                  key={`mod:${mod.name}`}
                                  type="button"
                                  onClick={() =>
                                    handleModel(cat.name, sch.name, mod.name)
                                  }
                                  className={cn(
                                    "flex w-full items-center gap-1.5 pl-11 pr-3 py-1 text-sm hover:bg-accent/50 transition-colors text-left",
                                    modActive && activeItemClass,
                                  )}
                                >
                                  <IconCarFan
                                    size={15}
                                    className={cn(
                                      "shrink-0 text-muted-foreground",
                                      modActive && activeIconClass,
                                    )}
                                  />
                                  <span className="truncate">{mod.name}</span>
                                </button>
                              )
                            })}
                          </>
                        )}
                      </div>
                    )
                  })}
              </div>
            )
          })}
        </div>
        <button
          type="button"
          aria-label="Resize catalog sidebar"
          onMouseDown={startResize}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault()
              resizeBy(-16)
            }
            if (event.key === "ArrowRight") {
              event.preventDefault()
              resizeBy(16)
            }
          }}
          className="absolute right-0 top-0 h-full w-1 translate-x-1/2 cursor-col-resize bg-transparent outline-none focus:bg-border/60 hover:bg-border/40"
        />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
