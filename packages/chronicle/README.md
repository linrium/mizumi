# Chronicle

Chronicle is a small Go Fiber server backed by a Tessera transparency log.
Local runs use Tessera POSIX storage by default. The Kubernetes manifests use
Tessera's AWS/S3 backend with RustFS for object storage and MySQL for
sequencing.

## Module

```text
github.com/linrium/mizuumi/packages/chronicle
```

## Run

```sh
go run .
```

The server listens on `:3000`.

The default Tessera log directory is `.data/tessera`.

## Routes

```text
GET  /             chronicle
GET  /healthz      {"ok":true}
GET  /tessera      Tessera runtime status
POST /entries      Append the request body to the Tessera log
GET  /checkpoint   Latest Tessera checkpoint
GET  /tile/*       Tessera tile resources
GET  /entries/*    Convenience alias for Tessera entry bundles under /tile/entries/*
GET  /docs/*       Scalar API reference and OpenAPI spec
```

## Configuration

```text
CHRONICLE_ADDR                         listen address, default :3000
CHRONICLE_STORAGE_BACKEND              posix or aws-s3, default posix
CHRONICLE_LOG_DIR                      Tessera POSIX log directory, default .data/tessera
CHRONICLE_SIGNER_KEY_FILE              checkpoint signer key file, default .data/tessera/.state/signer.key
CHRONICLE_AWS_S3_ENDPOINT              S3 endpoint for aws-s3 storage
CHRONICLE_AWS_S3_BUCKET                S3 bucket for aws-s3 storage
CHRONICLE_AWS_S3_BUCKET_PREFIX         optional S3 object prefix
CHRONICLE_AWS_S3_ACCESS_KEY            S3 access key
CHRONICLE_AWS_S3_SECRET_KEY            S3 secret key
CHRONICLE_AWS_S3_REGION                S3 signing region, default us-east-1
CHRONICLE_AWS_S3_USE_PATH_STYLE        path-style S3 addressing, default true
CHRONICLE_AWS_MYSQL_DSN                optional full MySQL DSN
CHRONICLE_AWS_MYSQL_HOST               MySQL host, default mysql
CHRONICLE_AWS_MYSQL_PORT               MySQL port, default 3306
CHRONICLE_AWS_MYSQL_DATABASE           MySQL database, default tessera
CHRONICLE_AWS_MYSQL_USER               MySQL user
CHRONICLE_AWS_MYSQL_PASSWORD           MySQL password
CHRONICLE_AWS_MYSQL_MAX_OPEN_CONNS     MySQL max open connections, default 0
CHRONICLE_AWS_MYSQL_MAX_IDLE_CONNS     MySQL max idle connections, default 2
```

## Container

```sh
docker build -t chronicle:latest .
docker run --rm -p 3000:3000 -v chronicle-data:/var/lib/chronicle chronicle:latest
```

## Kubernetes

```sh
cd ../storage && scripts/install.sh
cd ../chronicle
kubectl apply -k k8s
kubectl -n chronicle port-forward svc/chronicle 3000:80
```

For Docker Desktop Kubernetes:

```sh
scripts/deploy-local-docker-desktop.sh
```

See [docs/tessera.md](docs/tessera.md) for usage examples.

See [docs/openapi.md](docs/openapi.md) for the OpenAPI and Scalar integration.
