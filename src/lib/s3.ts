import { S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';

const endpoint = process.env.S3_ENDPOINT || 'http://garage:3900';
const accessKeyId = process.env.S3_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || '';
export const bucketName = process.env.S3_BUCKET_NAME || 'tcg-custom-sleeves';

export const s3Client = new S3Client({
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  region: 'garage', // Required by S3 SDK; custom region name works for Garage
  forcePathStyle: true, // Critical for Garage compatibility (path-style routing)
});

let bucketVerified = false;

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
    } else {
      console.error(`[S3] Error checking bucket existence:`, err);
      throw err;
    }
  }
}
