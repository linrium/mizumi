"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  type BlastRadiusPreview,
  type LlmRiskStatus,
  listBlastRadius,
} from "@/services/permissions"

function formatScopeLabel(scope: string) {
  return scope[0]?.toUpperCase() + scope.slice(1)
}

function LlmRiskBadge({ status }: { status: LlmRiskStatus }) {
  if (status === "processing") {
    return (
      <Badge variant="outline" className="animate-pulse text-muted-foreground">
        LLM analysing…
      </Badge>
    )
  }
  if (status === "failed") {
    return (
      <Badge
        variant="outline"
        className="text-destructive border-destructive/40"
      >
        LLM failed
      </Badge>
    )
  }
  if (status === "unknown") {
    return null
  }
  const variant =
    status === "high"
      ? "destructive"
      : status === "medium"
        ? "secondary"
        : "outline"
  return (
    <Badge variant={variant}>
      LLM {status[0]?.toUpperCase() + status.slice(1)} risk
    </Badge>
  )
}

export default function BlastRadiusPreviewPage() {
  const [previews, setPreviews] = useState<BlastRadiusPreview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listBlastRadius()
      .then(setPreviews)
      .finally(() => setLoading(false))
  }, [])

  const resolvedCount = previews.filter((p) => p.lineage_resolved).length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b shrink-0 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold">Blast-radius preview</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Impact analysis for requests that touch shared or sensitive
              resources.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {resolvedCount} request{resolvedCount === 1 ? "" : "s"} resolved to
            lineage
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="hover:bg-transparent">
              <TableHead>Request</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Impact</TableHead>
              <TableHead>Guardrail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : (
              previews.map((item) => (
                <TableRow key={item.request_id}>
                  <TableCell className="align-top">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/permissions/${item.request_id}`}
                          className="font-medium hover:underline"
                        >
                          {item.requester}
                        </Link>
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.code}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.consumers} consuming teams
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="space-y-1">
                      <div className="font-mono text-xs text-muted-foreground">
                        {item.resource}
                      </div>
                      <Badge variant="outline">
                        {formatScopeLabel(item.scope)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-xs text-muted-foreground">
                    {item.lineage_resolved ? (
                      <span>
                        {[
                          { v: item.total_downstream_nodes, l: "nodes" },
                          { v: item.downstream_tables, l: "datasets" },
                          { v: item.downstream_assets, l: "assets" },
                          { v: item.downstream_jobs, l: "jobs" },
                          { v: item.downstream_schedules, l: "schedules" },
                        ]
                          .filter(({ v }) => v > 0)
                          .map(({ v, l }) => `${v} ${l}`)
                          .join(" · ") || "No downstream"}
                      </span>
                    ) : (
                      <span>No lineage root</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top max-w-56">
                    <div className="space-y-1.5">
                      <LlmRiskBadge status={item.llm_risk} />
                      {item.llm_recommendation && (
                        <p className="text-xs font-medium whitespace-normal">
                          {item.llm_recommendation}
                        </p>
                      )}
                      {item.llm_explanation && (
                        <p className="text-xs text-muted-foreground whitespace-normal">
                          {item.llm_explanation}
                        </p>
                      )}
                      {!item.llm_recommendation &&
                        !item.llm_explanation &&
                        item.recommended_guardrail && (
                          <p className="text-xs text-muted-foreground whitespace-normal">
                            {item.recommended_guardrail}
                          </p>
                        )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
