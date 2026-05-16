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
  MOCK_BLAST_RADIUS,
  type RequestScope,
  type RiskLevel,
} from "../mock-data"

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

function formatScopeLabel(scope: RequestScope) {
  return scope[0]?.toUpperCase() + scope.slice(1)
}

export default function BlastRadiusPreviewPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b shrink-0 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold">Blast-radius preview</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Mock impact analysis for requests that touch shared or sensitive
              resources.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            2 requests should ship with extra guardrails
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
            {MOCK_BLAST_RADIUS.map((item) => (
              <TableRow key={item.requestId}>
                <TableCell className="align-top">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.requester}</span>
                      <span className="font-mono text-muted-foreground">
                        {item.requestId}
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
                  <div>{item.downstreamAssets} downstream assets</div>
                  <div>{item.dashboards} dashboards</div>
                  <div>{item.consumers} direct consumers</div>
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap gap-1">
                    {item.sensitiveDomains.map((domain) => (
                      <Badge key={domain} variant="outline">
                        {domain}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="align-top text-muted-foreground">
                  {item.recommendedGuardrail}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
