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
export const maxDuration = 120;

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
