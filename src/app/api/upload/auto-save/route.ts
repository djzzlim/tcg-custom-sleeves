import { NextResponse } from 'next/server';
import {
  assertS3Configured,
  bucketName,
  ensureBucketExists,
  publicObjectUrl,
  putObjectWithRetry,
} from '@/lib/s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Best-effort: log each preview URL to Google Sheets once per server session.
 * The S3 key is stable (designs/{purchaseId}/{designId}_preview.jpg), so we only need one row.
 */
const sheetLoggedKeys = new Set<string>();

export async function POST(request: Request) {
  try {
    assertS3Configured();
    const { canvasJson, jsonKey } = (await request.json()) as {
      canvasJson?: string;
      jsonKey?: string;
    };

    if (!jsonKey || !canvasJson) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Safety checks to prevent path traversal
    if (
      jsonKey.includes('..') ||
      !/^[a-zA-Z0-9_\-\.\/]+$/.test(jsonKey)
    ) {
      return NextResponse.json(
        { success: false, message: 'Invalid characters in keys' },
        { status: 400 }
      );
    }

    // Ensure bucket exists first
    await ensureBucketExists();

    // Upload JSON canvas state directly to Garage S3
    await putObjectWithRetry({
      Bucket: bucketName,
      Key: jsonKey,
      Body: Buffer.from(canvasJson, 'utf-8'),
      ContentType: 'application/json',
    });

    // Print S3 public upload link to the server terminal
    const fileUrl = publicObjectUrl(jsonKey);
    console.log(`\n🚀 [S3 Draft Canvas Auto-Save]: ${fileUrl}\n`);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[Auto-Save API] Error:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed to auto-save to S3' },
      { status: 500 }
    );
  }
}
