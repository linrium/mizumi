# Deployment

Chronicle includes a Dockerfile and Kubernetes manifests for a single-replica
deployment. Local containers use Tessera POSIX storage by default. The
Kubernetes manifests use Tessera's AWS/S3 backend with RustFS in the
`storage` namespace and MySQL in the `chronicle` namespace.

## Build the Image

From `packages/chronicle`:

```sh
docker build -t chronicle:latest .
```

Run it locally:

```sh
docker run --rm \
  -p 3000:3000 \
  -v chronicle-data:/var/lib/chronicle \
  chronicle:latest
```

The image sets:

```text
CHRONICLE_ADDR=:3000
CHRONICLE_LOG_DIR=/var/lib/chronicle/tessera
```

## Kubernetes

The manifests live in `k8s/` and include:

```text
namespace.yaml
persistent-volume-claim.yaml
rustfs-secret.yaml
mysql-secret.yaml
mysql-persistent-volume-claim.yaml
mysql-service.yaml
mysql-deployment.yaml
deployment.yaml
service.yaml
kustomization.yaml
```

Install RustFS first:

```sh
cd ../storage
scripts/install.sh
```

Apply them from `packages/chronicle`:

```sh
kubectl apply -k k8s
```

The Chronicle Deployment reaches RustFS through Kubernetes DNS:

```text
http://rustfs-svc.storage.svc.cluster.local:9000
```

Kubernetes secrets are namespace-scoped, so `k8s/rustfs-secret.yaml` mirrors the
default RustFS credentials into the `chronicle` namespace. If you install
RustFS with non-default credentials, update both the `storage/rustfs-auth`
secret and the `chronicle/rustfs-auth` secret.

The default mirrored credentials are `admin/adminadmin`. The secret key is at
least eight characters so common S3 clients such as the RustFS CLI accept it.

For Docker Desktop Kubernetes, use the local deploy script:

```sh
scripts/deploy-local-docker-desktop.sh
```

The script expects the active Kubernetes context to be `docker-desktop`, builds `chronicle:latest`, applies `k8s/`, and waits for the Deployment rollout.

Forward the service for local access:

```sh
kubectl -n chronicle port-forward svc/chronicle 3000:80
```

Then open:

```text
http://localhost:3000/docs
```

## Image Name

The default Deployment uses:

```text
chronicle:latest
```

For a registry image, update `k8s/deployment.yaml`:

```yaml
image: ghcr.io/linrium/chronicle:latest
```

## Storage

The Deployment mounts a `PersistentVolumeClaim` at:

```text
/var/lib/chronicle
```

The checkpoint signer key is stored under:

```text
/var/lib/chronicle/tessera/.state/signer.key
```

Tessera log resources are stored in the RustFS bucket named `chronicle`.
Tessera sequencing state is stored in the `chronicle-mysql` MySQL PVC.

Keep the signer key, RustFS bucket, and MySQL PVC together when restarting or
upgrading the deployment. Deleting the signer key while keeping old log data
changes the checkpoint signing identity.
