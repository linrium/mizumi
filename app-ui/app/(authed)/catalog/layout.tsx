"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Book03Icon,
  DatabaseIcon,
  TableIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Catalog = { name: string; comment?: string };
type Schema = { name: string; catalog_name: string; comment?: string };
type TableSummary = {
  name: string;
  catalog_name: string;
  schema_name: string;
  table_type: string;
};

// ── API ───────────────────────────────────────────────────────────────────────

async function apiFetch<T>(params: Record<string, string>): Promise<T> {
  const res = await fetch(`/api/catalog?${new URLSearchParams(params)}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

// ── Chevron ───────────────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className={cn(
        "shrink-0 transition-transform text-muted-foreground",
        open && "rotate-90",
      )}
    >
      <path
        d="M3 2l4 3-4 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Tree ──────────────────────────────────────────────────────────────────────

export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLDivElement | null>(null);

  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [schemas, setSchemas] = useState<Record<string, Schema[]>>({});
  const [tables, setTables] = useState<Record<string, TableSummary[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(360);

  useEffect(() => {
    apiFetch<{ catalogs: Catalog[] }>({ type: "catalogs" })
      .then((d) => setCatalogs(d.catalogs ?? []))
      .finally(() => setLoading(false));
  }, []);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function handleCatalog(cat: string) {
    toggle(cat);
    router.push(`/catalog/${cat}`);
    if (!schemas[cat]) {
      const d = await apiFetch<{ schemas: Schema[] }>({
        type: "schemas",
        catalog: cat,
      });
      setSchemas((prev) => ({ ...prev, [cat]: d.schemas ?? [] }));
    }
  }

  async function handleSchema(cat: string, sch: string) {
    const key = `${cat}.${sch}`;
    toggle(key);
    router.push(`/catalog/${cat}/${sch}`);
    if (!tables[key]) {
      const d = await apiFetch<{ tables: TableSummary[] }>({
        type: "tables",
        catalog: cat,
        schema: sch,
      });
      setTables((prev) => ({ ...prev, [key]: d.tables ?? [] }));
    }
  }

  function handleTable(cat: string, sch: string, tbl: string) {
    router.push(`/catalog/${cat}/${sch}/${tbl}`);
  }

  // Derive active segments from pathname: /catalog/[cat]/[sch]/[tbl]
  const parts = pathname.split("/").filter(Boolean); // ['catalog', cat, sch, tbl]
  const activeCat = parts[1];
  const activeSch = parts[2];
  const activeTbl = parts[3];

  function startResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();

    const minWidth = 300;
    const maxWidth = 640;

    function onMouseMove(moveEvent: MouseEvent) {
      const nextWidth = sidebarRef.current
        ? moveEvent.clientX - sidebarRef.current.getBoundingClientRect().left
        : moveEvent.clientX;
      setSidebarWidth(Math.min(maxWidth, Math.max(minWidth, nextWidth)));
    }

    function onMouseUp() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Tree panel ── */}
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
            const catOpen = expanded.has(cat.name);
            const catActive = activeCat === cat.name && !activeSch;

            return (
              <div key={cat.name}>
                {/* Catalog row */}
                <button
                  type="button"
                  onClick={() => handleCatalog(cat.name)}
                  className={cn(
                    "flex w-full items-center gap-1.5 pl-2 pr-3 py-1 text-sm hover:bg-accent/50 transition-colors text-left",
                    catActive && "bg-accent text-accent-foreground font-medium",
                  )}
                >
                  <Chevron open={catOpen} />
                  <HugeiconsIcon
                    icon={Book03Icon}
                    size={15}
                    className="shrink-0 text-muted-foreground"
                  />
                  <span className="truncate flex-1">{cat.name}</span>
                </button>

                {catOpen &&
                  (schemas[cat.name] ?? []).map((sch) => {
                    const schKey = `${cat.name}.${sch.name}`;
                    const schOpen = expanded.has(schKey);
                    const schActive =
                      activeCat === cat.name &&
                      activeSch === sch.name &&
                      !activeTbl;

                    return (
                      <div key={schKey}>
                        {/* Schema row */}
                        <button
                          type="button"
                          onClick={() => handleSchema(cat.name, sch.name)}
                          className={cn(
                            "flex w-full items-center gap-1.5 pl-6 pr-3 py-1 text-sm hover:bg-accent/50 transition-colors text-left",
                            schActive &&
                              "bg-accent text-accent-foreground font-medium",
                          )}
                        >
                          <Chevron open={schOpen} />
                          <HugeiconsIcon
                            icon={DatabaseIcon}
                            size={15}
                            className="shrink-0 text-muted-foreground"
                          />
                          <span className="truncate flex-1">{sch.name}</span>
                        </button>

                        {schOpen &&
                          (tables[schKey] ?? []).map((tbl) => {
                            const tblActive =
                              activeCat === cat.name &&
                              activeSch === sch.name &&
                              activeTbl === tbl.name;

                            return (
                              <button
                                key={tbl.name}
                                type="button"
                                onClick={() =>
                                  handleTable(cat.name, sch.name, tbl.name)
                                }
                                className={cn(
                                  "flex w-full items-center gap-1.5 pl-11 pr-3 py-1 text-sm hover:bg-accent/50 transition-colors text-left",
                                  tblActive &&
                                    "bg-accent text-accent-foreground font-medium",
                                )}
                              >
                                <HugeiconsIcon
                                  icon={TableIcon}
                                  size={15}
                                  className="shrink-0 text-muted-foreground"
                                />
                                <span className="truncate">{tbl.name}</span>
                              </button>
                            );
                          })}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize catalog sidebar"
          onMouseDown={startResize}
          className="absolute inset-y-0 right-0 w-1 cursor-col-resize bg-transparent transition-colors hover:bg-border"
        />
      </div>

      {/* ── Detail panel ── */}
      <div className="flex-1 min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}
