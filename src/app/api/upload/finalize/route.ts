import { NextResponse } from 'next/server';
import { finalizeUpload } from '@/lib/uploadStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { uploadId, filename, mimeType } = (await request.json()) as {
      uploadId?: string;
      filename?: string;
      mimeType?: string;
    };
    if (!uploadId) {
      return NextResponse.json(
        { success: false, message: 'Missing uploadId' },
        { status: 400 }
      );
    }
    const summary = finalizeUpload(uploadId, { filename, mimeType });
    return NextResponse.json({ success: true, uploadId, ...summary });
  } catch (error: any) {
    console.error('[Upload finalize] error', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Finalize failed' },
      { status: 500 }
    );
  }
}
