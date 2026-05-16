import { formatDistanceToNowStrict } from "date-fns"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { MOCK_POLICY_TEMPLATES, type RiskLevel } from "../mock-data"

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

function formatApprovalMode(mode: string) {
  if (mode === "auto") return "Auto-approve"
  if (mode === "review") return "Reviewer gate"
  return "Security escalation"
}

export default function PolicyTemplatesPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b shrink-0 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold">Policy templates</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Reusable grant recipes for common access patterns.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            2 templates are eligible for auto-approval
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="hover:bg-transparent">
              <TableHead>Template</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Privileges</TableHead>
              <TableHead>Teams</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_POLICY_TEMPLATES.map((template) => (
              <TableRow key={template.id}>
                <TableCell className="align-top">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{template.name}</span>
                      <span className="font-mono text-muted-foreground">
                        {template.id}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      Updated{" "}
                      {formatDistanceToNowStrict(
                        new Date(template.lastUpdated),
                        {
                          addSuffix: true,
                        },
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline">
                      {formatScopeLabel(template.scope)}
                    </Badge>
                    <Badge variant={getRiskVariant(template.risk)}>
                      {template.risk} risk
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {template.privileges.map((privilege) => (
                      <Badge key={privilege} variant="outline">
                        {privilege}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex max-w-[28ch] flex-wrap gap-1">
                    {template.teams.map((team) => (
                      <Badge key={team} variant="outline">
                        {team}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatApprovalMode(template.approvalMode)}
                </TableCell>
                <TableCell>{template.usage30d} requests / 30d</TableCell>
                <TableCell>{template.owner}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
