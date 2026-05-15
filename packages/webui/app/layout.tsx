import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { AuthHeaderProvider } from "@/components/auth-header-provider"
import { getServerSession } from "@/services/auth"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Mizumi",
  description: "Kubernetes-native data platform",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getServerSession()

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col">
        <AuthHeaderProvider idToken={session?.idToken} />
        {children}
        <Toaster />
      </body>
    </html>
  )
}
