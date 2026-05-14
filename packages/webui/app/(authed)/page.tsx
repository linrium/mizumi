export default function Home() {
  return (
    <div className="p-6 flex flex-col gap-2">
      <h1 className="text-lg font-semibold">Welcome to Mizumi</h1>
      <p className="text-sm text-muted-foreground">
        A Kubernetes-native data platform orchestrating a medallion lakehouse.
      </p>
    </div>
  )
}
