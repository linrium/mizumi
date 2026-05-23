import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3"
import type { ListObjectsResult, S3Object } from "./catalog-types"

function createS3Client() {
  return new S3Client({
    endpoint:
      process.env.RUSTFS_S3_URL ??
      "http://rustfs-svc.rustfs.svc.cluster.local:9000",
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.RUSTFS_ACCESS_KEY_ID ?? "rustfsadmin",
      secretAccessKey: process.env.RUSTFS_SECRET_ACCESS_KEY ?? "rustfsadmin",
    },
    forcePathStyle: true,
  })
}

export async function listS3Objects(
  bucket: string,
  prefix: string,
  options?: { limit?: number; continuationToken?: string },
): Promise<ListObjectsResult> {
  const client = createS3Client()
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`

  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: normalizedPrefix,
      MaxKeys: options?.limit ?? 10,
      ContinuationToken: options?.continuationToken,
    }),
  )

  const objects: S3Object[] = (res.Contents ?? []).map((obj) => ({
    key: obj.Key ?? "",
    size: obj.Size ?? 0,
    last_modified: obj.LastModified?.toISOString() ?? "",
    etag: (obj.ETag ?? "").replace(/"/g, ""),
  }))

  return { objects, nextContinuationToken: res.NextContinuationToken }
}
