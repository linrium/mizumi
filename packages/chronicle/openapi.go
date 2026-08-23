package main

import (
	"encoding/json"
	"log"
)

type openAPIDocument struct {
	OpenAPI    string                     `json:"openapi"`
	Info       openAPIInfo                `json:"info"`
	Servers    []openAPIServer            `json:"servers,omitempty"`
	Paths      map[string]openAPIPathItem `json:"paths"`
	Components openAPIComponents          `json:"components,omitempty"`
}

type openAPIInfo struct {
	Title   string `json:"title"`
	Summary string `json:"summary,omitempty"`
	Version string `json:"version"`
}

type openAPIServer struct {
	URL         string `json:"url"`
	Description string `json:"description,omitempty"`
}

type openAPIPathItem struct {
	Get  *openAPIOperation `json:"get,omitempty"`
	Post *openAPIOperation `json:"post,omitempty"`
}

type openAPIOperation struct {
	Summary     string                     `json:"summary,omitempty"`
	Description string                     `json:"description,omitempty"`
	OperationID string                     `json:"operationId,omitempty"`
	Parameters  []openAPIParameter         `json:"parameters,omitempty"`
	RequestBody *openAPIRequestBody        `json:"requestBody,omitempty"`
	Responses   map[string]openAPIResponse `json:"responses"`
}

type openAPIParameter struct {
	Name        string        `json:"name"`
	In          string        `json:"in"`
	Required    bool          `json:"required,omitempty"`
	Description string        `json:"description,omitempty"`
	Schema      openAPISchema `json:"schema"`
}

type openAPIRequestBody struct {
	Required bool                        `json:"required,omitempty"`
	Content  map[string]openAPIMediaType `json:"content"`
}

type openAPIResponse struct {
	Ref         string                      `json:"$ref,omitempty"`
	Description string                      `json:"description,omitempty"`
	Content     map[string]openAPIMediaType `json:"content,omitempty"`
}

type openAPIMediaType struct {
	Schema openAPISchema `json:"schema"`
}

type openAPISchema struct {
	Ref        string                   `json:"$ref,omitempty"`
	Type       string                   `json:"type,omitempty"`
	Format     string                   `json:"format,omitempty"`
	Enum       []string                 `json:"enum,omitempty"`
	Items      *openAPISchema           `json:"items,omitempty"`
	Required   []string                 `json:"required,omitempty"`
	Properties map[string]openAPISchema `json:"properties,omitempty"`
	Minimum    *int                     `json:"minimum,omitempty"`
	Example    any                      `json:"example,omitempty"`
}

type openAPIComponents struct {
	Responses map[string]openAPIResponse `json:"responses,omitempty"`
	Schemas   map[string]openAPISchema   `json:"schemas,omitempty"`
}

func openAPISpec() string {
	spec, err := json.MarshalIndent(openAPIMetadata(), "", "  ")
	if err != nil {
		log.Fatalf("generate OpenAPI spec: %v", err)
	}
	return string(spec)
}

func openAPIMetadata() openAPIDocument {
	return openAPIDocument{
		OpenAPI: "3.1.0",
		Info: openAPIInfo{
			Title:   "Chronicle API",
			Summary: "Fiber API for appending to and reading from a local Tessera POSIX transparency log.",
			Version: "0.1.0",
		},
		Servers: []openAPIServer{
			{
				URL:         "http://localhost:3000",
				Description: "Local development server",
			},
		},
		Paths: map[string]openAPIPathItem{
			"/": {
				Get: &openAPIOperation{
					Summary:     "Root",
					OperationID: "getRoot",
					Responses: responses(
						response("200", "Service name", content("text/plain", stringSchema("chronicle"))),
					),
				},
			},
			"/healthz": {
				Get: &openAPIOperation{
					Summary:     "Health check",
					OperationID: "getHealthz",
					Responses: responses(
						response("200", "Service health", content("application/json", schemaRef("HealthResponse"))),
					),
				},
			},
			"/tessera": {
				Get: &openAPIOperation{
					Summary:     "Tessera status",
					OperationID: "getTesseraStatus",
					Responses: responses(
						response("200", "Tessera runtime status", content("application/json", schemaRef("TesseraStatus"))),
						errorResponse("500"),
					),
				},
			},
			"/entries": {
				Post: &openAPIOperation{
					Summary:     "Append an entry",
					Description: "Appends the raw request body to the Tessera transparency log.",
					OperationID: "appendEntry",
					RequestBody: &openAPIRequestBody{
						Required: true,
						Content: map[string]openAPIMediaType{
							"text/plain":               {Schema: stringSchema("hello tessera")},
							"application/octet-stream": {Schema: binaryStringSchema()},
						},
					},
					Responses: responses(
						response("201", "Entry appended and assigned a Tessera log index", content("application/json", schemaRef("AppendEntryResponse"))),
						errorResponse("400"),
						errorResponse("500"),
					),
				},
			},
			"/api/entries": {
				Get: &openAPIOperation{
					Summary:     "List entries",
					Description: "Returns decoded log entries with pagination and optional text search.",
					OperationID: "listEntries",
					Parameters: []openAPIParameter{
						queryParameter("limit", "Maximum entries to return, capped at 500."),
						queryParameter("offset", "Entry index offset, or matching-entry offset when q is supplied."),
						queryParameter("q", "Optional text search across entry body and common event fields."),
					},
					Responses: responses(
						response("200", "Entries page", content("application/json", schemaRef("EntriesResponse"))),
						errorResponse("400"),
						errorResponse("500"),
					),
				},
			},
			"/api/entries/search": {
				Get: &openAPIOperation{
					Summary:     "Search entries",
					Description: "Alias for /api/entries with the q query parameter.",
					OperationID: "searchEntries",
					Parameters: []openAPIParameter{
						queryParameter("limit", "Maximum matching entries to return, capped at 500."),
						queryParameter("offset", "Matching-entry offset."),
						queryParameter("q", "Text search across entry body and common event fields."),
					},
					Responses: responses(
						response("200", "Entries page", content("application/json", schemaRef("EntriesResponse"))),
						errorResponse("400"),
						errorResponse("500"),
					),
				},
			},
			"/api/entries/{index}/proof": {
				Get: &openAPIOperation{
					Summary:     "Verify entry inclusion",
					Description: "Builds and verifies a Merkle inclusion proof for one entry against the latest signed checkpoint.",
					OperationID: "getEntryProof",
					Parameters: []openAPIParameter{
						pathParameter("index", "Log entry index to prove."),
					},
					Responses: responses(
						response("200", "Inclusion proof verification result", content("application/json", schemaRef("EntryProofResponse"))),
						errorResponse("400"),
						errorResponse("404"),
						errorResponse("500"),
					),
				},
			},
			"/checkpoint": {
				Get: &openAPIOperation{
					Summary:     "Read checkpoint",
					OperationID: "getCheckpoint",
					Responses: responses(
						response("200", "Latest Tessera checkpoint", content("text/plain", openAPISchema{Type: "string"})),
						errorResponse("404"),
						errorResponse("500"),
					),
				},
			},
			"/tile/{tilePath}": {
				Get: &openAPIOperation{
					Summary:     "Read a Tessera tile resource",
					Description: "Reads a file from CHRONICLE_LOG_DIR/tile/{tilePath}. Use /checkpoint and the tlog-tiles layout to derive tile paths.",
					OperationID: "getTile",
					Parameters: []openAPIParameter{
						pathParameter("tilePath", "Path below the Tessera tile directory, for example entries/000.p/1 or 0/000.p/1."),
					},
					Responses: responses(
						response("200", "Tile bytes", content("application/octet-stream", binaryStringSchema())),
						errorResponse("400"),
						errorResponse("404"),
						errorResponse("500"),
					),
				},
			},
			"/entries/{bundlePath}": {
				Get: &openAPIOperation{
					Summary:     "Read a Tessera entry bundle",
					Description: "Convenience alias for CHRONICLE_LOG_DIR/tile/entries/{bundlePath}.",
					OperationID: "getEntryBundle",
					Parameters: []openAPIParameter{
						pathParameter("bundlePath", "Path below tile/entries, for example 000.p/1."),
					},
					Responses: responses(
						response("200", "Entry bundle bytes", content("application/octet-stream", binaryStringSchema())),
						errorResponse("400"),
						errorResponse("404"),
						errorResponse("500"),
					),
				},
			},
			"/docs": {
				Get: &openAPIOperation{
					Summary:     "Scalar API reference",
					OperationID: "getScalarDocs",
					Responses: responses(
						response("200", "Scalar API reference HTML", content("text/html", openAPISchema{Type: "string"})),
					),
				},
			},
			"/docs/doc.json": {
				Get: &openAPIOperation{
					Summary:     "OpenAPI specification",
					OperationID: "getOpenAPISpec",
					Responses: responses(
						response("200", "OpenAPI 3.1 specification", content("application/json", openAPISchema{Type: "object"})),
					),
				},
			},
		},
		Components: openAPIComponents{
			Responses: map[string]openAPIResponse{
				"Error": responseValue("Error response", content("text/plain", openAPISchema{Type: "string"})),
			},
			Schemas: map[string]openAPISchema{
				"HealthResponse": objectSchema(
					[]string{"ok"},
					map[string]openAPISchema{
						"ok": {Type: "boolean", Example: true},
					},
				),
				"TesseraStatus": objectSchema(
					[]string{"storage_backend", "log_dir", "signer", "verifier_key", "next_index", "integrated_size"},
					map[string]openAPISchema{
						"storage_backend": {Type: "string", Enum: []string{"posix", "aws-s3"}, Example: "posix"},
						"log_dir":         {Type: "string", Example: ".data/tessera"},
						"signer":          {Type: "string", Example: "chronicle"},
						"verifier_key":    {Type: "string"},
						"next_index":      uint64Schema(),
						"integrated_size": uint64Schema(),
					},
				),
				"AppendEntryResponse": objectSchema(
					[]string{"index", "duplicate", "published_by"},
					map[string]openAPISchema{
						"index":        uint64SchemaWithExample(0),
						"duplicate":    {Type: "boolean", Example: false},
						"published_by": {Type: "string", Example: "/checkpoint"},
					},
				),
				"LogEntry": objectSchema(
					[]string{"index", "bundle"},
					map[string]openAPISchema{
						"index":       uint64SchemaWithExample(0),
						"bundle":      {Type: "string", Example: "000.p/1"},
						"body":        {Type: "string"},
						"body_base64": {Type: "string"},
						"json":        {Type: "object"},
						"event_type":  {Type: "string", Example: "permission.granted"},
						"source":      {Type: "string", Example: "controlplane"},
						"occurred_at": {Type: "string", Example: "2026-08-23T12:00:00Z"},
					},
				),
				"EntriesResponse": objectSchema(
					[]string{"entries", "has_more", "limit", "offset", "query", "total"},
					map[string]openAPISchema{
						"entries":  arraySchema(schemaRef("LogEntry")),
						"has_more": {Type: "boolean", Example: false},
						"limit":    uint64SchemaWithExample(100),
						"offset":   uint64SchemaWithExample(0),
						"query":    {Type: "string"},
						"total":    uint64SchemaWithExample(1),
					},
				),
				"EntryProofResponse": objectSchema(
					[]string{"index", "tree_size", "leaf_hash", "root_hash", "proof", "verified", "checkpoint", "entry", "checkpoint_verified"},
					map[string]openAPISchema{
						"index":              uint64SchemaWithExample(0),
						"tree_size":          uint64SchemaWithExample(1),
						"leaf_hash":          {Type: "string"},
						"root_hash":          {Type: "string"},
						"proof":              arraySchema(openAPISchema{Type: "string"}),
						"verified":           {Type: "boolean", Example: true},
						"verification_error": {Type: "string"},
						"checkpoint":         {Type: "string"},
						"entry":              schemaRef("LogEntry"),
						"checkpoint_verified": {
							Type:    "boolean",
							Example: true,
						},
					},
				),
			},
		},
	}
}

func schemaRef(name string) openAPISchema {
	return openAPISchema{Ref: "#/components/schemas/" + name}
}

func responseRef(name string) openAPIResponse {
	return openAPIResponse{Ref: "#/components/responses/" + name}
}

func errorResponse(status string) keyedOpenAPIResponse {
	return keyedOpenAPIResponse{status: status, response: responseRef("Error")}
}

func response(status string, description string, contentTypes ...keyedOpenAPIMediaType) keyedOpenAPIResponse {
	return keyedOpenAPIResponse{status: status, response: responseValue(description, contentTypes...)}
}

func responseValue(description string, contentTypes ...keyedOpenAPIMediaType) openAPIResponse {
	response := openAPIResponse{Description: description}
	if len(contentTypes) > 0 {
		response.Content = make(map[string]openAPIMediaType, len(contentTypes))
		for _, contentType := range contentTypes {
			response.Content[contentType.mediaType] = contentType.value
		}
	}
	return response
}

type keyedOpenAPIResponse struct {
	status   string
	response openAPIResponse
}

func responses(items ...keyedOpenAPIResponse) map[string]openAPIResponse {
	values := make(map[string]openAPIResponse, len(items))
	for _, item := range items {
		values[item.status] = item.response
	}
	return values
}

type keyedOpenAPIMediaType struct {
	mediaType string
	value     openAPIMediaType
}

func content(mediaType string, schema openAPISchema) keyedOpenAPIMediaType {
	return keyedOpenAPIMediaType{
		mediaType: mediaType,
		value:     openAPIMediaType{Schema: schema},
	}
}

func objectSchema(required []string, properties map[string]openAPISchema) openAPISchema {
	return openAPISchema{
		Type:       "object",
		Required:   required,
		Properties: properties,
	}
}

func arraySchema(item openAPISchema) openAPISchema {
	return openAPISchema{
		Type:  "array",
		Items: &item,
	}
}

func stringSchema(example string) openAPISchema {
	return openAPISchema{Type: "string", Example: example}
}

func binaryStringSchema() openAPISchema {
	return openAPISchema{Type: "string", Format: "binary"}
}

func uint64Schema() openAPISchema {
	zero := 0
	return openAPISchema{Type: "integer", Format: "uint64", Minimum: &zero}
}

func uint64SchemaWithExample(example uint64) openAPISchema {
	schema := uint64Schema()
	schema.Example = example
	return schema
}

func pathParameter(name string, description string) openAPIParameter {
	return openAPIParameter{
		Name:        name,
		In:          "path",
		Required:    true,
		Description: description,
		Schema:      openAPISchema{Type: "string"},
	}
}

func queryParameter(name string, description string) openAPIParameter {
	return openAPIParameter{
		Name:        name,
		In:          "query",
		Description: description,
		Schema:      openAPISchema{Type: "string"},
	}
}
