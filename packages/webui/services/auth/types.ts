export type AppSession = {
  id: string
  userId: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
  realm: string
  sub?: string
  preferredUsername?: string
  groups?: string[]
  idToken?: string
  accessToken?: string
  expiresAt: Date
}
