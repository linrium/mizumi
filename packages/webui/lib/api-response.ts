export async function readApiResponse<T>(
  res: Response
): Promise<T & { error?: string }> {
  const text = await res.text()
  if (!text) {
    return {} as T & { error?: string }
  }

  try {
    return JSON.parse(text) as T & { error?: string }
  } catch {
    return { error: text } as T & { error?: string }
  }
}
