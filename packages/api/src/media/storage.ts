import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/** Where garment photos live. Cloudflare R2 in production; any S3-compatible store locally. */
export interface MediaStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

export type S3StorageConfig = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Public base URL objects are served from, e.g. an R2 custom domain. */
  publicBaseUrl: string;
  region?: string;
};

export class S3MediaStorage implements MediaStorage {
  private readonly client: S3Client;
  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region ?? "auto",
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Keys are content-unique, so objects never change.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  publicUrl(key: string) {
    return `${this.config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }
}

/** For tests. */
export class MemoryMediaStorage implements MediaStorage {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();
  async put(key: string, body: Uint8Array, contentType: string) {
    this.objects.set(key, { body, contentType });
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
  publicUrl(key: string) {
    return `https://media.test/${key}`;
  }
}

/** Used when no media env vars are set: uploads fail loudly instead of silently vanishing. */
export class UnconfiguredMediaStorage implements MediaStorage {
  async put(): Promise<never> {
    throw new Error("Media storage is not configured (set MEDIA_* env vars)");
  }
  async delete() {}
  publicUrl(key: string) {
    return `/missing-media/${key}`;
  }
}

/** Reads MEDIA_* env vars (R2 in production, RustFS locally). */
export function mediaStorageFromEnv(env: Record<string, string | undefined>): MediaStorage {
  const { MEDIA_ENDPOINT, MEDIA_BUCKET, MEDIA_ACCESS_KEY_ID, MEDIA_SECRET_ACCESS_KEY, MEDIA_PUBLIC_BASE_URL } = env;
  if (!MEDIA_ENDPOINT || !MEDIA_BUCKET || !MEDIA_ACCESS_KEY_ID || !MEDIA_SECRET_ACCESS_KEY || !MEDIA_PUBLIC_BASE_URL) {
    return new UnconfiguredMediaStorage();
  }
  return new S3MediaStorage({
    endpoint: MEDIA_ENDPOINT,
    bucket: MEDIA_BUCKET,
    accessKeyId: MEDIA_ACCESS_KEY_ID,
    secretAccessKey: MEDIA_SECRET_ACCESS_KEY,
    publicBaseUrl: MEDIA_PUBLIC_BASE_URL,
  });
}
