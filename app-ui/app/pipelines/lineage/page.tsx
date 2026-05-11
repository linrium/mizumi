'use client'

import dynamic from 'next/dynamic'

const LineageGraph = dynamic(
  () => import('../assets/[...path]/LineageGraph').then((m) => m.LineageGraph),
  { ssr: false },
)

export default function LineagePage() {
  return (
    <div className="flex-1 min-h-0 relative">
      <LineageGraph />
    </div>
  )
}
