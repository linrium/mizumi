import {
  IconAlertTriangle,
  IconBoxModel,
  IconClock,
  IconGitBranch,
  IconTag,
} from "@tabler/icons-react"
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
  type MlflowRegisteredModel,
  searchRegisteredModels,
} from "@/services/mlflow"

function formatTimestamp(timestamp?: number) {
  if (!timestamp) {
    return "Never"
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp))
}

function statusVariant(status?: string) {
  if (status === "READY") {
    return "secondary"
  }
  if (status) {
    return "outline"
  }
  return "ghost"
}

function ModelAliases({ model }: { model: MlflowRegisteredModel }) {
  if (!model.aliases?.length) {
    return <span className="text-muted-foreground">None</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {model.aliases.map((alias) => (
        <Badge
          className="font-mono"
          key={`${alias.alias}-${alias.version}`}
          variant="outline"
        >
          <IconTag size={10} />
          {alias.alias}: v{alias.version}
        </Badge>
      ))}
    </div>
  )
}

function LatestVersions({ model }: { model: MlflowRegisteredModel }) {
  if (!model.latest_versions?.length) {
    return <span className="text-muted-foreground">No versions</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {model.latest_versions.map((version) => (
        <Badge className="font-mono" key={version.version} variant="outline">
          <IconGitBranch size={10} />v{version.version}
          {version.current_stage && version.current_stage !== "None"
            ? ` ${version.current_stage}`
            : ""}
        </Badge>
      ))}
    </div>
  )
}

export default async function ModelRegistryPage() {
  let models: MlflowRegisteredModel[] = []
  let error: string | null = null

  try {
    const data = await searchRegisteredModels()
    models = data.registered_models ?? []
  } catch (err) {
    error =
      err instanceof Error ? err.message : "Failed to load registered models"
  }

  function renderModelsBody() {
    if (error) {
      return (
        <TableRow>
          <TableCell
            className="h-24 text-center text-muted-foreground"
            colSpan={6}
          >
            Unable to load registered models.
          </TableCell>
        </TableRow>
      )
    }
    if (models.length === 0) {
      return (
        <TableRow>
          <TableCell
            className="h-24 text-center text-muted-foreground"
            colSpan={6}
          >
            No registered models found
          </TableCell>
        </TableRow>
      )
    }
    return models.map((model) => {
      const latest = model.latest_versions?.[0]

      return (
        <TableRow key={model.name}>
          <TableCell className="font-medium">{model.name}</TableCell>
          <TableCell>
            <LatestVersions model={model} />
          </TableCell>
          <TableCell>
            <Badge variant={statusVariant(latest?.status)}>
              {latest?.status ?? "Unknown"}
            </Badge>
          </TableCell>
          <TableCell>
            <ModelAliases model={model} />
          </TableCell>
          <TableCell
            className="max-w-[320px] truncate font-mono text-muted-foreground"
            title={latest?.source}
          >
            {latest?.source ?? "None"}
          </TableCell>
          <TableCell className="text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <IconClock size={13} />
              {formatTimestamp(model.last_updated_timestamp)}
            </span>
          </TableCell>
        </TableRow>
      )
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <IconBoxModel className="text-muted-foreground" size={16} />
              <h1 className="font-semibold text-sm">Model Registry</h1>
            </div>
            <p className="mt-0.5 text-muted-foreground text-xs">
              Registered MLflow models sorted by name.
            </p>
            {error ? (
              <p className="mt-1 flex items-center gap-1.5 text-destructive text-xs">
                <IconAlertTriangle size={13} />
                {error}
              </p>
            ) : null}
          </div>
          <Badge variant="outline">{models.length} total</Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Latest versions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aliases</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{renderModelsBody()}</TableBody>
        </Table>
      </div>
    </div>
  )
}
