import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { AuthHeaderProvider } from "@/components/auth-header-provider"
import { getServerSession } from "@/lib/auth"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  description: "Kubernetes-native data platform",
  title: "Mizumi",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getServerSession()

  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      lang="en"
    >
      <body className="flex h-full flex-col">
        <AuthHeaderProvider idToken={session?.idToken} />
        {children}
        <Toaster />
      </body>
    </html>
  )
}
