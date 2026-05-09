# Mizumi

## Daft on Kubernetes

This repo includes a Helm-based Daft quickstart setup under `infra/k8s/daft/`, following the current upstream quickstart chart documentation.

Simple mode:

```bash
just daft-simple-deploy
```

Distributed mode:

```bash
just daft-distributed-deploy
```

Ray dashboard and Grafana port-forward for distributed mode:

```bash
just daft-distributed-forward
```

Cleanup:

```bash
just daft-destroy
```

The install commands use the upstream OCI chart `oci://ghcr.io/eventual-inc/daft/quickstart` with script injection via `--set-file job.script=...`.
