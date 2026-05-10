import { SqlEditor } from '@/components/sql-editor'

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl p-6 flex flex-col gap-6">
      <h1 className="text-lg font-semibold">SQL Query</h1>
      <SqlEditor />
    </main>
  )
}
