import { NextResponse } from 'next/server';
import {
  assertS3Configured,
  bucketName,
  ensureBucketExists,
  publicObjectUrl,
  putObjectWithRetry,
} from '@/lib/s3';

const sheetLoggedKeys = new Set<string>();

export async function POST(request: Request) {
  try {
    assertS3Configured();
    const formData = await request.formData();
    const key = String(formData.get('key') ?? '');
    const contentType = String(formData.get('contentType') ?? 'application/octet-stream');
    const file = formData.get('file');

    if (!key || !(file instanceof Blob)) {
      return NextResponse.json(
        { success: false, message: 'Missing key or file' },
        { status: 400 }
      );
    }

    if (key.includes('..') || !/^[a-zA-Z0-9_\-\.\/]+$/.test(key)) {
      return NextResponse.json(
        { success: false, message: 'Invalid characters in key' },
        { status: 400 }
      );
    }

    if (!key.startsWith('designs/') || !key.includes('_highres.')) {
      return NextResponse.json(
        { success: false, message: 'Invalid high-res key path' },
        { status: 400 }
      );
    }

    await ensureBucketExists();

    const body = Buffer.from(await file.arrayBuffer());

    await putObjectWithRetry({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    const fileUrl = publicObjectUrl(key);
    console.log(`\n🚀 [S3 High-Res Upload]: ${fileUrl}\n`);

    // Best-effort: write the high-res URL to Google Sheets (once per key).
    const webhookUrl = (process.env.GOOGLE_SHEETS_WEBHOOK_URL || '').trim();
    if (webhookUrl && !sheetLoggedKeys.has(key)) {
      sheetLoggedKeys.add(key);

      const parts = key.split('/');
      const purchaseId = parts[1] || 'unknown';
      const fileName = parts.slice(-1)[0] || 'highres.png';
      const jsonKey = key.replace(/_highres\.(png|jpg|jpeg)$/, '_canvas.json');
      const jsonUrl = publicObjectUrl(jsonKey);

      void fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Keep the payload shape compatible with the existing Apps Script order webhook.
        body: JSON.stringify({
          purchaseId,
          remarks: `highres: ${fileName} | json: ${jsonKey}`,
          status: 'Draft',
          designs: [
            {
              name: fileName,
              quantity: 1,
              dataUrl: fileUrl,
              uploadId: key,
              mimeType: contentType,
              jsonUrl,
            },
          ],
        }),
      }).catch((e) => {
        sheetLoggedKeys.delete(key);
        console.error('[High-Res API] Failed to post URL to Sheets webhook:', e);
      });
    }

    return NextResponse.json({ success: true, key, fileUrl });
  } catch (error: unknown) {
    console.error('[High-Res Upload API] Error:', error);
    const raw = error instanceof Error ? error.message : 'Failed to upload high-res file';
    const message = raw.includes('No such key') && raw.includes(process.env.S3_ACCESS_KEY_ID ?? '___')
      ? 'S3 rejected the access key in .env.local. Ask your team to verify Garage S3 credentials (read + write on ccs-bucket).'
      : raw;
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
