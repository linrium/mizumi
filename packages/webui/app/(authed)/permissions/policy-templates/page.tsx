"use client"

import { formatDistanceToNowStrict } from "date-fns"
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
  listPolicyTemplates,
  type PolicyTemplate,
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

function formatApprovalMode(mode: string) {
  if (mode === "auto") {
    return "Auto-approve"
  }
  if (mode === "review") {
    return "Reviewer gate"
  }
  return "Security escalation"
}

function formatResourceLabel(resource: string | null) {
  return resource ?? "Any resource"
}

export default function PolicyTemplatesPage() {
  const [templates, setTemplates] = useState<PolicyTemplate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listPolicyTemplates()
      .then(setTemplates)
      .finally(() => setLoading(false))
  }, [])

  const autoApproveCount = templates.filter(
    (t) => t.approval_mode === "auto"
  ).length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-semibold text-sm">Policy templates</h1>
            <p className="mt-0.5 text-muted-foreground text-xs">
              Reusable grant recipes for common access patterns.
            </p>
          </div>
          <div className="text-muted-foreground text-xs">
            {autoApproveCount} template
            {autoApproveCount === 1 ? "" : "s"} eligible for auto-approval
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="hover:bg-transparent">
              <TableHead>Template</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Privileges</TableHead>
              <TableHead>Teams</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  className="h-24 text-center text-muted-foreground"
                  colSpan={8}
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : (
              templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="align-top">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Link
                          className="font-medium hover:underline"
                          href={`/permissions/policy-templates/${template.id}`}
                        >
                          {template.name}
                        </Link>
                      </div>
                      <div className="text-muted-foreground">
                        Updated{" "}
                        {formatDistanceToNowStrict(
                          new Date(template.last_updated),
                          { addSuffix: true }
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
                  <TableCell className="font-mono text-muted-foreground">
                    {formatResourceLabel(template.resource)}
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
                    <div className="space-y-1">
                      <div>{formatApprovalMode(template.approval_mode)}</div>
                      {template.approval_steps.length > 0 && (
                        <div className="flex max-w-[28ch] flex-wrap gap-1">
                          {template.approval_steps.map((step) => (
                            <Badge key={step.id} variant="outline">
                              {`S${step.stage_order} · ${step.approver_team}`}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{template.usage_30d} requests / 30d</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div>{template.owner}</div>
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
