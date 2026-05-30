import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';

const endpoint = process.env.S3_ENDPOINT || 'http://garage:3900';
const accessKeyId = process.env.S3_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || '';
export const bucketName = process.env.S3_BUCKET_NAME || 'tcg-custom-sleeves';

export const s3Client = new S3Client({
  endpoint: endpoint.replace(/\/$/, ''),
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  region: 'garage', // Required by S3 SDK; custom region name works for Garage
  forcePathStyle: true, // Critical for Garage compatibility (path-style routing)
  // AWS SDK v3 default checksums can break Garage S3 — use legacy signing.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

export function assertS3Configured() {
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('S3 credentials missing. Set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in .env.local');
  }
}

let bucketVerified = false;

/** Garage may return transient AccessDenied under concurrent writes — retry a few times. */
export async function putObjectWithRetry(input: PutObjectCommandInput, attempts = 3) {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await s3Client.send(new PutObjectCommand(input));
      return;
    } catch (err) {
      lastError = err;
      const code =
        (err as { Code?: string; name?: string }).Code ?? (err as { name?: string }).name;
      if (code !== 'AccessDenied' || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastError;
}

export function publicObjectUrl(key: string): string {
  const endpoint = process.env.S3_ENDPOINT || 'https://s3.cardcollectionstudio.shop';
  return `${endpoint}/${bucketName}/${key}`;
}

export async function ensureBucketExists() {
  if (bucketVerified) return;
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    bucketVerified = true;
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      console.log(`[S3] Bucket "${bucketName}" not found. Creating it...`);
      try {
        await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
        bucketVerified = true;
        console.log(`[S3] Bucket "${bucketName}" successfully created.`);
      } catch (createErr) {
        console.error(`[S3] Failed to create bucket "${bucketName}":`, createErr);
        throw createErr;
      }
    } else if (err.$metadata?.httpStatusCode === 403) {
      // Garage often denies HeadBucket for app keys that can still PutObject.
      console.warn(`[S3] HeadBucket forbidden for "${bucketName}"; continuing with PutObject.`);
      bucketVerified = true;
    } else {
      console.error(`[S3] Error checking bucket existence:`, err);
      throw err;
    }
  }
}
