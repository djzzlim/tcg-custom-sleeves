import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, bucketName, ensureBucketExists } from '@/lib/s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { imageBase64, canvasJson, imageKey, jsonKey } = (await request.json()) as {
      imageBase64?: string;
      canvasJson?: string;
      imageKey?: string;
      jsonKey?: string;
    };

    if (!imageKey || !jsonKey || !imageBase64 || !canvasJson) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Safety checks to prevent path traversal
    if (
      imageKey.includes('..') ||
      jsonKey.includes('..') ||
      !/^[a-zA-Z0-9_\-\.\/]+$/.test(imageKey) ||
      !/^[a-zA-Z0-9_\-\.\/]+$/.test(jsonKey)
    ) {
      return NextResponse.json(
        { success: false, message: 'Invalid characters in keys' },
        { status: 400 }
      );
    }

    // Ensure bucket exists first
    await ensureBucketExists();

    // Convert base64 data URL to binary Buffer
    const match = /^data:([^;,]+)(;base64)?,(.*)$/.exec(imageBase64);
    if (!match) {
      return NextResponse.json(
        { success: false, message: 'Invalid imageBase64 data URL' },
        { status: 400 }
      );
    }
    const isBase64 = !!match[2];
    const data = match[3] || '';
    const imageBuffer = isBase64
      ? Buffer.from(data, 'base64')
      : Buffer.from(decodeURIComponent(data), 'utf-8');

    // 1. Upload preview image directly to Garage S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: imageKey,
        Body: imageBuffer,
        ContentType: 'image/jpeg',
      })
    );

    // 2. Upload JSON canvas state directly to Garage S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: jsonKey,
        Body: Buffer.from(canvasJson, 'utf-8'),
        ContentType: 'application/json',
      })
    );

    // Print S3 public upload link to the server terminal
    const endpoint = process.env.S3_ENDPOINT || 'https://s3.cardcollectionstudio.shop';
    const fileUrl = `${endpoint}/${bucketName}/${imageKey}`;
    console.log(`\n🚀 [S3 Upload Link]: ${fileUrl}\n`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Auto-Save API] Error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to auto-save to S3' },
      { status: 500 }
    );
  }
}
