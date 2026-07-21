"use client"

import { createContext, useContext } from "react"
import type { VolumeDetail } from "@/services/catalog-types"

export type { VolumeDetail } from "@/services/catalog-types"

export const VolumeContext = createContext<VolumeDetail | null>(null)

export function useVolumeDetail() {
  return useContext(VolumeContext)
}
