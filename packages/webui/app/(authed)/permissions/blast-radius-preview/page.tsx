"use client"

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
  listBlastRadius,
  type RiskLevel,
} from "@/services/permissions"

function getRiskVariant(risk: RiskLevel) {
  switch (risk) {
    case "high":
      return "destructive"
    case "medium":
      return "secondary"
    default:
      return "outline"
  }
}

function formatScopeLabel(scope: string) {
  return scope[0]?.toUpperCase() + scope.slice(1)
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
              <TableHead>Sensitive domains</TableHead>
              <TableHead>Recommended guardrail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
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
                        <span className="font-medium">{item.requester}</span>
                        <span className="font-mono text-muted-foreground">
                          {item.request_id}
                        </span>
                      </div>
                      <div className="text-muted-foreground">
                        {item.consumers} consuming teams
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="space-y-1">
                      <div className="font-mono text-muted-foreground">
                        {item.resource}
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline">
                          {formatScopeLabel(item.scope)}
                        </Badge>
                        <Badge variant={getRiskVariant(item.risk)}>
                          {item.risk} risk
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground">
                    {item.lineage_resolved ? (
                      <>
                        <div>
                          {item.total_downstream_nodes} downstream nodes
                        </div>
                        <div>{item.downstream_tables} datasets</div>
                        <div>{item.downstream_assets} assets</div>
                        <div>{item.downstream_jobs} jobs</div>
                        <div>{item.downstream_schedules} schedules</div>
                      </>
                    ) : (
                      <div>No lineage root resolved</div>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap gap-1">
                      {item.sensitive_domains.map((domain) => (
                        <Badge key={domain} variant="outline">
                          {domain}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground">
                    {item.recommended_guardrail}
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
