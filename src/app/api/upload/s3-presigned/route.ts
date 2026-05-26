import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, bucketName, ensureBucketExists } from '@/lib/s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { key, contentType } = (await request.json()) as {
      key?: string;
      contentType?: string;
    };

    if (!key) {
      return NextResponse.json(
        { success: false, message: 'Missing key parameter' },
        { status: 400 }
      );
    }

    // Safe sanitization check to prevent path traversal/unwanted characters
    if (key.includes('..') || !/^[a-zA-Z0-9_\-\.\/]+$/.test(key)) {
      return NextResponse.json(
        { success: false, message: 'Invalid characters in key' },
        { status: 400 }
      );
    }

    // Ensure the S3 bucket exists before generating pre-signed URLs
    await ensureBucketExists();

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });

    // Generate pre-signed URL with a 15-minute expiration window (900 seconds)
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    // The predefined, stable S3 URL of the resource after upload completes
    const endpoint = process.env.S3_ENDPOINT || 'http://garage:3900';
    const fileUrl = `${endpoint}/${bucketName}/${key}`;

    // Print S3 public upload link to the server terminal
    console.log(`\n🚀 [S3 Upload Link]: ${fileUrl}\n`);

    return NextResponse.json({
      success: true,
      uploadUrl,
      fileUrl,
      key,
    });
  } catch (error: any) {
    console.error('[S3 Presigned API] Error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to generate pre-signed URL' },
      { status: 500 }
    );
  }
}
