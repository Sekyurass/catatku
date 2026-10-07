import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

/** Penyimpanan berkas lampiran. Penyedia bisa diganti lewat env tanpa mengubah fitur. */
export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
  /** Tautan baca sementara; berkas tidak pernah publik. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Supabase Storage (protokol S3), Cloudflare R2, MinIO, atau AWS S3. */
export function createS3Storage(cfg: S3StorageConfig): ObjectStorage {
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'private, max-age=86400, immutable',
        }),
      );
    },
    async remove(keys) {
      // DeleteObjects menerima maksimal 1000 kunci per panggilan.
      for (let i = 0; i < keys.length; i += 1000) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: cfg.bucket,
            Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }
    },
    signedUrl(key, expiresIn) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), {
        expiresIn,
      });
    },
  };
}

/** Untuk tes: berkas disimpan di memori proses. */
export function createMemoryStorage(): ObjectStorage & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async put(key, body) {
      objects.set(key, body);
    },
    async remove(keys) {
      for (const key of keys) objects.delete(key);
    },
    async signedUrl(key, expiresIn) {
      return `memory://${key}?expires=${expiresIn}`;
    },
  };
}

function fromEnv(): ObjectStorage | null {
  if (env.isTest) return createMemoryStorage();
  if (!env.STORAGE_S3_ENDPOINT) return null;
  return createS3Storage({
    endpoint: env.STORAGE_S3_ENDPOINT,
    region: env.STORAGE_S3_REGION,
    bucket: env.STORAGE_S3_BUCKET,
    accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
  });
}

let storage: ObjectStorage | null | undefined;

/** null = penyimpanan belum dikonfigurasi (fitur lampiran dianggap nonaktif). */
export function getStorage(): ObjectStorage | null {
  if (storage === undefined) storage = fromEnv();
  return storage;
}

export function setStorageForTests(next: ObjectStorage | null): void {
  storage = next;
}
