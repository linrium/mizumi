import { handleCatalogGet, handleCatalogPatch } from "@/services/catalog"

export async function GET(request: Request) {
  return handleCatalogGet(request)
}

export async function PATCH(request: Request) {
  return handleCatalogPatch(request)
}
