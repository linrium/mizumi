import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3"
import type { ListObjectsResult, S3Object } from "./catalog-types"

function createS3Client() {
  return new S3Client({
    credentials: {
      accessKeyId: process.env.RUSTFS_ACCESS_KEY_ID ?? "rustfsadmin",
      secretAccessKey: process.env.RUSTFS_SECRET_ACCESS_KEY ?? "rustfsadmin",
    },
    endpoint:
      process.env.RUSTFS_S3_URL ??
      "http://rustfs-svc.rustfs.svc.cluster.local:9000",
    forcePathStyle: true,
    region: "us-east-1",
  })
}

export async function listS3Objects(
  bucket: string,
  prefix: string,
  options?: { limit?: number; continuationToken?: string }
): Promise<ListObjectsResult> {
  const client = createS3Client()
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`

  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: options?.continuationToken,
      MaxKeys: options?.limit ?? 10,
      Prefix: normalizedPrefix,
    })
  )

  const objects: S3Object[] = (res.Contents ?? []).map((obj) => ({
    etag: (obj.ETag ?? "").replace(/"/g, ""),
    key: obj.Key ?? "",
    last_modified: obj.LastModified?.toISOString() ?? "",
    size: obj.Size ?? 0,
  }))

  return { nextContinuationToken: res.NextContinuationToken, objects }
}
