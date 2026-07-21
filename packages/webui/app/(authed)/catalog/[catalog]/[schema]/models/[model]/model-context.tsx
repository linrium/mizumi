"use client"

import { createContext, useContext } from "react"
import type { RegisteredModelDetail } from "@/services/catalog-types"

export type { RegisteredModelDetail } from "@/services/catalog-types"

export const ModelContext = createContext<RegisteredModelDetail | null>(null)

export function useModelDetail() {
  return useContext(ModelContext)
}
