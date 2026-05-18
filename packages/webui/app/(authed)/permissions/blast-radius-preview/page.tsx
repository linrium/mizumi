"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type BlastRadiusPreview,
  type LlmRiskStatus,
  listBlastRadius,
  type RiskLevel,
} from "@/services/permissions";

function getRiskVariant(risk: RiskLevel) {
  switch (risk) {
    case "high":
      return "destructive";
    case "medium":
      return "secondary";
    default:
      return "outline";
  }
}

function formatRiskLabel(risk: RiskLevel) {
  return `${risk[0]?.toUpperCase() + risk.slice(1)} risk`;
}

function formatScopeLabel(scope: string) {
  return scope[0]?.toUpperCase() + scope.slice(1);
}

function LlmRiskBadge({ status }: { status: LlmRiskStatus }) {
  if (status === "processing") {
    return (
      <Badge variant="outline" className="animate-pulse text-muted-foreground">
        LLM analysing…
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge
        variant="outline"
        className="text-destructive border-destructive/40"
      >
        LLM failed
      </Badge>
    );
  }
  if (status === "unknown") {
    return null;
  }
  const variant =
    status === "high"
      ? "destructive"
      : status === "medium"
        ? "secondary"
        : "outline";
  return (
    <Badge variant={variant}>
      LLM {status[0]?.toUpperCase() + status.slice(1)} risk
    </Badge>
  );
}

export default function BlastRadiusPreviewPage() {
  const [previews, setPreviews] = useState<BlastRadiusPreview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listBlastRadius()
      .then(setPreviews)
      .finally(() => setLoading(false));
  }, []);

  const resolvedCount = previews.filter((p) => p.lineage_resolved).length;

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
              <TableHead>Guardrail</TableHead>
              <TableHead>LLM assessment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
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
                          Request {formatRiskLabel(item.risk)}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground">
                    {item.lineage_resolved ? (
                      <div className="space-y-1">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={getRiskVariant(item.derived_risk)}>
                            Derived {formatRiskLabel(item.derived_risk)}
                          </Badge>
                        </div>
                        <div>
                          {item.total_downstream_nodes} downstream nodes
                        </div>
                        <div>{item.downstream_tables} datasets</div>
                        <div>{item.downstream_assets} assets</div>
                        <div>{item.downstream_jobs} jobs</div>
                        <div>{item.downstream_schedules} schedules</div>
                      </div>
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
                  <TableCell className="align-top text-muted-foreground text-xs max-w-56">
                    {item.recommended_guardrail || (
                      <span className="italic">None</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="space-y-1.5">
                      <LlmRiskBadge status={item.llm_risk} />
                      {item.llm_recommended_guardrail && (
                        <p className="text-xs text-muted-foreground max-w-56">
                          {item.llm_recommended_guardrail}
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
  );
}
