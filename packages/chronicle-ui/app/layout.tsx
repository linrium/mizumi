import type { Metadata } from "next"
import "./globals.css"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Chronicle",
  description: "Tessera transparency log console",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("h-full", "font-sans", "antialiased")}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
