# OpenAPI and Scalar

Chronicle serves an embedded OpenAPI 3.1 specification through Scalar.

## Start the Server

```sh
go run .
```

## Open the API Reference

Open the Scalar UI:

```text
http://localhost:3000/docs
```

Fetch the raw OpenAPI JSON:

```sh
curl http://localhost:3000/docs/doc.json
```

## Implementation

The OpenAPI document is generated from typed metadata in `openapi.go`.

Scalar is mounted in `main.go`:

```go
app.Get("/docs/*", scalar.New(scalar.Config{
	FileContentString: openAPISpec(),
	Path:              "/docs",
	Title:             "Chronicle API",
	Theme:             scalar.ThemeDefault,
}))
```

Update the OpenAPI metadata builder whenever routes, request bodies, or response bodies change.
