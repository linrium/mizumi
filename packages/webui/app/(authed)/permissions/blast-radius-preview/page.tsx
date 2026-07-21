"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
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
      <Badge className="animate-pulse text-muted-foreground" variant="outline">
        LLM analysing…
      </Badge>
    )
  }
  if (status === "failed") {
    return (
      <Badge
        className="border-destructive/40 text-destructive"
        variant="outline"
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
      <div className="shrink-0 border-b px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-semibold text-sm">Blast-radius preview</h1>
            <p className="mt-0.5 text-muted-foreground text-xs">
              Impact analysis for requests that touch shared or sensitive
              resources.
            </p>
          </div>
          <div className="text-muted-foreground text-xs">
            {resolvedCount} request{resolvedCount === 1 ? "" : "s"} resolved to
            lineage
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
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
                  className="h-24 text-center text-muted-foreground"
                  colSpan={4}
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
                          className="font-medium hover:underline"
                          href={`/permissions/${item.request_id}`}
                        >
                          {item.requester}
                        </Link>
                        <span className="font-mono text-muted-foreground text-xs">
                          {item.code}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="space-y-1">
                      <div className="font-mono text-muted-foreground text-xs">
                        {item.resource}
                      </div>
                      <Badge variant="outline">
                        {formatScopeLabel(item.scope)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground text-xs">
                    {item.lineage_resolved ? (
                      <span>
                        {[
                          { l: "nodes", v: item.total_downstream_nodes },
                          { l: "datasets", v: item.downstream_tables },
                          { l: "assets", v: item.downstream_assets },
                          { l: "jobs", v: item.downstream_jobs },
                          { l: "schedules", v: item.downstream_schedules },
                        ]
                          .filter(({ v }) => v > 0)
                          .map(({ v, l }) => `${v} ${l}`)
                          .join(" · ") || "No downstream"}
                      </span>
                    ) : (
                      <span>No lineage root</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-56 align-top">
                    <div className="space-y-1.5">
                      <LlmRiskBadge status={item.llm_risk} />
                      {item.llm_recommendation && (
                        <p className="whitespace-normal font-medium text-xs">
                          {item.llm_recommendation}
                        </p>
                      )}
                      {item.llm_explanation && (
                        <p className="whitespace-normal text-muted-foreground text-xs">
                          {item.llm_explanation}
                        </p>
                      )}
                      {!(item.llm_recommendation || item.llm_explanation) &&
                        item.recommended_guardrail && (
                          <p className="whitespace-normal text-muted-foreground text-xs">
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
