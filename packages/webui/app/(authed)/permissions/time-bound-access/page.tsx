"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { useEffect, useState } from "react";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listTimeBoundGrants,
  type TimeBoundGrant,
} from "@/services/permissions";

function getRenewalVariant(status: "healthy" | "expiring" | "expired") {
  switch (status) {
    case "healthy":
      return "success";
    case "expiring":
      return "warning";
    default:
      return "error";
  }
}

function formatRenewalLabel(status: "healthy" | "expiring" | "expired") {
  if (status === "healthy") return "Healthy";
  if (status === "expiring") return "Expiring";
  return "Expired";
}

export default function TimeBoundAccessPage() {
  const [grants, setGrants] = useState<TimeBoundGrant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listTimeBoundGrants()
      .then(setGrants)
      .finally(() => setLoading(false));
  }, []);

  const expiringToday = grants.filter((g) => {
    const diff = new Date(g.expires_at).getTime() - Date.now();
    return diff >= 0 && diff < 86_400_000;
  }).length;

  const expired = grants.filter((g) => g.renewal_status === "expired").length;

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
            {expiringToday > 0 &&
              `${expiringToday} grant${expiringToday === 1 ? "" : "s"} expire${expiringToday === 1 ? "s" : ""} today`}
            {expiringToday > 0 && expired > 0 && " and "}
            {expired > 0 && `${expired} have already lapsed`}
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
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : (
              grants.map((grant) => (
                <TableRow key={grant.id}>
                  <TableCell className="align-top">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{grant.principal}</span>
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
                      {formatDistanceToNowStrict(new Date(grant.started_at), {
                        addSuffix: true,
                      })}
                    </div>
                    <div>
                      Expires{" "}
                      {formatDistanceToNowStrict(new Date(grant.expires_at), {
                        addSuffix: true,
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Status variant={getRenewalVariant(grant.renewal_status)}>
                      <StatusIndicator />
                      <StatusLabel>
                        {formatRenewalLabel(grant.renewal_status)}
                      </StatusLabel>
                    </Status>
                  </TableCell>
                  <TableCell>{grant.reviewer}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {grant.reason}
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
