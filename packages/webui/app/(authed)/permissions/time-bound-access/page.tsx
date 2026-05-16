import { formatDistanceToNowStrict } from "date-fns"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { MOCK_TIME_BOUND_GRANTS } from "../mock-data"

function getRenewalVariant(status: "healthy" | "expiring" | "expired") {
  switch (status) {
    case "healthy":
      return "success"
    case "expiring":
      return "warning"
    default:
      return "error"
  }
}

function formatRenewalLabel(status: "healthy" | "expiring" | "expired") {
  if (status === "healthy") return "Healthy"
  if (status === "expiring") return "Expiring"
  return "Expired"
}

export default function TimeBoundAccessPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b shrink-0 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold">Time-bound access</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Temporary grants, renewals, and expirations that need attention.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            1 grant expires today and 1 has already lapsed
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="hover:bg-transparent">
              <TableHead>Principal</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Privilege</TableHead>
              <TableHead>Window</TableHead>
              <TableHead>Renewal</TableHead>
              <TableHead>Reviewer</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_TIME_BOUND_GRANTS.map((grant) => (
              <TableRow key={grant.grantId}>
                <TableCell className="align-top">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{grant.principal}</span>
                      <span className="font-mono text-muted-foreground">
                        {grant.grantId}
                      </span>
                    </div>
                    <div className="text-muted-foreground">{grant.team}</div>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {grant.resource}
                </TableCell>
                <TableCell>{grant.privilege}</TableCell>
                <TableCell className="align-top text-muted-foreground">
                  <div>
                    Started{" "}
                    {formatDistanceToNowStrict(new Date(grant.startedAt), {
                      addSuffix: true,
                    })}
                  </div>
                  <div>
                    Expires{" "}
                    {formatDistanceToNowStrict(new Date(grant.expiresAt), {
                      addSuffix: true,
                    })}
                  </div>
                </TableCell>
                <TableCell>
                  <Status variant={getRenewalVariant(grant.renewalStatus)}>
                    <StatusIndicator />
                    <StatusLabel>
                      {formatRenewalLabel(grant.renewalStatus)}
                    </StatusLabel>
                  </Status>
                </TableCell>
                <TableCell>{grant.reviewer}</TableCell>
                <TableCell className="text-muted-foreground">
                  {grant.reason}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
