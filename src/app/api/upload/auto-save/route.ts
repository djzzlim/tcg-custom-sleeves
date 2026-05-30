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
    await putObjectWithRetry({
      Bucket: bucketName,
      Key: imageKey,
      Body: imageBuffer,
      ContentType: 'image/jpeg',
    });

    // 2. Upload JSON canvas state directly to Garage S3
    await putObjectWithRetry({
      Bucket: bucketName,
      Key: jsonKey,
      Body: Buffer.from(canvasJson, 'utf-8'),
      ContentType: 'application/json',
    });

    // Print S3 public upload link to the server terminal
    const fileUrl = publicObjectUrl(imageKey);
    console.log(`\n🚀 [S3 Upload Link]: ${fileUrl}\n`);

    // Best-effort: write the preview URL to Google Sheets (once per key).
    const webhookUrl = (process.env.GOOGLE_SHEETS_WEBHOOK_URL || '').trim();
    if (webhookUrl && !sheetLoggedKeys.has(imageKey)) {
      sheetLoggedKeys.add(imageKey);

      const purchaseId = imageKey.split('/')[1] || 'unknown';
      const previewName = imageKey.split('/').slice(-1)[0] || 'preview.jpg';
      const jsonUrl = publicObjectUrl(jsonKey);

      void fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Keep the payload shape compatible with the existing Apps Script order webhook.
        body: JSON.stringify({
          purchaseId,
          remarks: `autosave: ${previewName} | json: ${jsonKey}`,
          status: 'Draft',
          designs: [
            {
              name: previewName,
              quantity: 1,
              dataUrl: fileUrl,
              // Extra fields: Apps Script should ignore if it doesn't know them.
              uploadId: imageKey,
              mimeType: 'image/jpeg',
              jsonUrl,
            },
          ],
        }),
      }).catch((e) => {
        sheetLoggedKeys.delete(imageKey);
        console.error('[Auto-Save API] Failed to post URL to Sheets webhook:', e);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[Auto-Save API] Error:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed to auto-save to S3' },
      { status: 500 }
    );
  }
}
