import { NextResponse } from 'next/server';
import { putChunk } from '@/lib/uploadStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const uploadId = String(form.get('uploadId') ?? '');
    const chunkIndex = Number(form.get('chunkIndex'));
    const chunkTotal = Number(form.get('chunkTotal'));
    const chunk = form.get('chunk');

    if (!uploadId) {
      return NextResponse.json(
        { success: false, message: 'Missing uploadId' },
        { status: 400 }
      );
    }
    if (!Number.isFinite(chunkIndex) || !Number.isFinite(chunkTotal) || chunkTotal <= 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid chunk index/total' },
        { status: 400 }
      );
    }
    if (!(chunk instanceof Blob)) {
      return NextResponse.json(
        { success: false, message: 'Missing chunk payload' },
        { status: 400 }
      );
    }
    if (chunk.size === 0) {
      return NextResponse.json(
        { success: false, message: 'Empty chunk' },
        { status: 400 }
      );
    }
    if (chunk.size > MAX_CHUNK_BYTES) {
      return NextResponse.json(
        { success: false, message: `Chunk too large (>${MAX_CHUNK_BYTES} bytes)` },
        { status: 413 }
      );
    }

    const buffer = new Uint8Array(await chunk.arrayBuffer());
    putChunk(uploadId, chunkIndex, chunkTotal, buffer);
    return NextResponse.json({ success: true, received: buffer.byteLength });
  } catch (error: any) {
    console.error('[Upload chunk] error', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Chunk upload failed' },
      { status: 500 }
    );
  }
}
