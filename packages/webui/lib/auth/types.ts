export interface AppSession {
  accessToken?: string
  email: string
  emailVerified: boolean
  expiresAt: Date
  groups?: string[]
  id: string
  idToken?: string
  image?: string | null
  name: string
  preferredUsername?: string
  realm: string
  sub?: string
  userId: string
}
