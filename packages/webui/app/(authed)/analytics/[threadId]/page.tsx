import { AnalyticsChatPage } from "../analytics-chat-page"

type AnalyticsThreadPageProps = {
  params: Promise<{
    threadId: string
  }>
}

export default async function AnalyticsThreadPage({
  params,
}: AnalyticsThreadPageProps) {
  const { threadId } = await params
  return <AnalyticsChatPage threadId={threadId} />
}
