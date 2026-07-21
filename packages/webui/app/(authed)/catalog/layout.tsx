"use client"

import {
  IconBrain,
  IconChevronRight,
  IconDatabase,
  IconFolder,
  IconTable,
  IconTriangleSquareCircle,
} from "@tabler/icons-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type {
  Catalog,
  RegisteredModelSummary,
  Schema,
  TableSummary,
  VolumeSummary,
} from "@/services/catalog-types"
import {
  getCatalogsAction,
  getModelsAction,
  getSchemasAction,
  getTablesAction,
  getVolumesAction,
} from "./actions"

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
  const [models, setModels] = useState<
    Record<string, RegisteredModelSummary[]>
  >({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(360)
  const parts = pathname.split("/").filter(Boolean)
  const [, activeCat] = parts
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
    resourceParts[1] === "volumes" && resourceParts[2]
      ? resourceParts[2]
      : undefined
  const activeMod =
    resourceParts[1] === "models" && resourceParts[2]
      ? resourceParts[2]
      : undefined
  const activeItemClass =
    "bg-primary/12 text-foreground font-medium ring-1 ring-primary/20"
  const activeIconClass = "text-primary"

  useEffect(() => {
    getCatalogsAction()
      .then((data) => setCatalogs(data.catalogs ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!activeCat) {
      return
    }

    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(activeCat)
      if (activeSch) {
        next.add(`${activeCat}.${activeSch}`)
      }
      return next
    })

    if (!schemas[activeCat]) {
      getSchemasAction(activeCat)
        .then((data) => {
          setSchemas((prev) => ({ ...prev, [activeCat]: data.schemas ?? [] }))
        })
        .catch(() => {
          // best-effort schema prefetch; errors surface on explicit navigation
        })
    }
  }, [activeCat, activeSch, schemas])

  useEffect(() => {
    if (!(activeCat && activeSch)) {
      return
    }

    const key = `${activeCat}.${activeSch}`
    if (tables[key]) {
      return
    }

    Promise.all([
      getTablesAction(activeCat, activeSch),
      getVolumesAction(activeCat, activeSch).catch(() => ({
        volumes: [] as VolumeSummary[],
      })),
      getModelsAction(activeCat, activeSch).catch(() => ({
        registered_models: [] as RegisteredModelSummary[],
      })),
    ])
      .then(([tablesData, volumesData, modelsData]) => {
        setTables((prev) => ({ ...prev, [key]: tablesData.tables ?? [] }))
        setVolumes((prev) => ({ ...prev, [key]: volumesData.volumes ?? [] }))
        setModels((prev) => ({
          ...prev,
          [key]: modelsData.registered_models ?? [],
        }))
      })
      .catch(() => {
        // best-effort table/volume/model prefetch; partial failures use fallbacks above
      })
  }, [activeCat, activeSch, tables])

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
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
        getVolumesAction(cat, sch).catch(() => ({
          volumes: [] as VolumeSummary[],
        })),
        getModelsAction(cat, sch).catch(() => ({
          registered_models: [] as RegisteredModelSummary[],
        })),
      ])
      setTables((prev) => ({ ...prev, [key]: tablesData.tables ?? [] }))
      setVolumes((prev) => ({ ...prev, [key]: volumesData.volumes ?? [] }))
      setModels((prev) => ({
        ...prev,
        [key]: modelsData.registered_models ?? [],
      }))
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
        className="relative flex shrink-0 select-none flex-col overflow-hidden border-r"
        ref={sidebarRef}
        style={{ width: sidebarWidth }}
      >
        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <p className="px-4 py-3 text-muted-foreground text-xs">Loading…</p>
          ) : null}

          {catalogs.map((cat) => {
            const catOpen = expanded.has(cat.name)
            const catActive = activeCat === cat.name && !activeSch

            return (
              <div key={cat.name}>
                <button
                  className={cn(
                    "flex w-full items-center gap-1.5 py-1 pr-3 pl-2 text-left text-sm transition-colors hover:bg-accent/50",
                    catActive && activeItemClass
                  )}
                  onClick={() => handleCatalog(cat.name)}
                  type="button"
                >
                  <IconChevronRight
                    aria-hidden="true"
                    className={cn(
                      "shrink-0 text-muted-foreground transition-transform",
                      catOpen && "rotate-90"
                    )}
                    size={14}
                  />
                  <IconTriangleSquareCircle
                    className={cn(
                      "shrink-0 text-muted-foreground",
                      catActive && activeIconClass
                    )}
                    size={15}
                  />
                  <span className="flex-1 truncate">{cat.name}</span>
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
                          className={cn(
                            "flex w-full items-center gap-1.5 py-1 pr-3 pl-6 text-left text-sm transition-colors hover:bg-accent/50",
                            schActive && activeItemClass
                          )}
                          onClick={() => handleSchema(cat.name, sch.name)}
                          type="button"
                        >
                          <IconChevronRight
                            aria-hidden="true"
                            className={cn(
                              "shrink-0 text-muted-foreground transition-transform",
                              schOpen && "rotate-90"
                            )}
                            size={14}
                          />
                          <IconDatabase
                            className={cn(
                              "shrink-0 text-muted-foreground",
                              schActive && activeIconClass
                            )}
                            size={15}
                          />
                          <span className="flex-1 truncate">{sch.name}</span>
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
                                  className={cn(
                                    "flex w-full items-center gap-1.5 py-1 pr-3 pl-11 text-left text-sm transition-colors hover:bg-accent/50",
                                    tblActive && activeItemClass
                                  )}
                                  key={tbl.name}
                                  onClick={() =>
                                    handleTable(cat.name, sch.name, tbl.name)
                                  }
                                  type="button"
                                >
                                  <IconTable
                                    className={cn(
                                      "shrink-0 text-muted-foreground",
                                      tblActive && activeIconClass
                                    )}
                                    size={15}
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
                                  className={cn(
                                    "flex w-full items-center gap-1.5 py-1 pr-3 pl-11 text-left text-sm transition-colors hover:bg-accent/50",
                                    volActive && activeItemClass
                                  )}
                                  key={`vol:${vol.name}`}
                                  onClick={() =>
                                    handleVolume(cat.name, sch.name, vol.name)
                                  }
                                  type="button"
                                >
                                  <IconFolder
                                    className={cn(
                                      "shrink-0 text-muted-foreground",
                                      volActive && activeIconClass
                                    )}
                                    size={15}
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
                                  className={cn(
                                    "flex w-full items-center gap-1.5 py-1 pr-3 pl-11 text-left text-sm transition-colors hover:bg-accent/50",
                                    modActive && activeItemClass
                                  )}
                                  key={`mod:${mod.name}`}
                                  onClick={() =>
                                    handleModel(cat.name, sch.name, mod.name)
                                  }
                                  type="button"
                                >
                                  <IconBrain
                                    className={cn(
                                      "shrink-0 text-muted-foreground",
                                      modActive && activeIconClass
                                    )}
                                    size={15}
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
          aria-label="Resize catalog sidebar"
          className="absolute top-0 right-0 h-full w-1 translate-x-1/2 cursor-col-resize bg-transparent outline-none hover:bg-border/40 focus:bg-border/60"
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
          onMouseDown={startResize}
          type="button"
        />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
