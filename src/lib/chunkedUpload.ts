/**
 * Resumable client-side chunked uploads.
 *
 * The caller hands us a Blob and a filename; we split into ~4 MB chunks and
 * POST each one to `/api/upload/chunk`. On network errors we retry with
 * exponential backoff. After all chunks land, we call `/api/upload/finalize`
 * to assemble them on the server and return a stable `uploadId` the rest of
 * the app can reference (e.g. in the order payload).
 */

export const UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 25 * 1024 * 1024;
const MAX_ATTEMPTS_PER_CHUNK = 4;
const BACKOFF_BASE_MS = 500;

export type UploadProgress = {
  uploadId: string;
  bytesUploaded: number;
  totalBytes: number;
  chunkIndex: number;
  chunkTotal: number;
};

export type ChunkedUploadOptions = {
  chunkSize?: number;
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
};

export type ChunkedUploadResult = {
  uploadId: string;
  size: number;
};

function generateUploadId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `up-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

async function postChunkWithRetry(args: {
  uploadId: string;
  chunkIndex: number;
  chunkTotal: number;
  chunk: Blob;
  signal?: AbortSignal;
}): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_CHUNK; attempt++) {
    try {
      const form = new FormData();
      form.append('uploadId', args.uploadId);
      form.append('chunkIndex', String(args.chunkIndex));
      form.append('chunkTotal', String(args.chunkTotal));
      form.append('chunk', args.chunk, `chunk-${args.chunkIndex}.bin`);
      const res = await fetch('/api/upload/chunk', {
        method: 'POST',
        body: form,
        signal: args.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Chunk ${args.chunkIndex} failed: ${res.status} ${text || res.statusText}`);
      }
      return;
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') throw err;
      lastErr = err;
      if (attempt < MAX_ATTEMPTS_PER_CHUNK) {
        const wait = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        await sleep(wait, args.signal);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Chunk upload failed');
}

export async function uploadBlobInChunks(
  blob: Blob,
  filename: string,
  options: ChunkedUploadOptions = {}
): Promise<ChunkedUploadResult> {
  if (blob.size > MAX_OUTPUT_BYTES) {
    throw new Error(
      `Output is ${(blob.size / 1024 / 1024).toFixed(1)} MB which exceeds the ${MAX_OUTPUT_BYTES / 1024 / 1024} MB limit.`
    );
  }
  const chunkSize = options.chunkSize ?? UPLOAD_CHUNK_SIZE;
  const chunkTotal = Math.max(1, Math.ceil(blob.size / chunkSize));
  const uploadId = generateUploadId();
  let bytesUploaded = 0;

  for (let i = 0; i < chunkTotal; i++) {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const start = i * chunkSize;
    const end = Math.min(blob.size, start + chunkSize);
    const chunk = blob.slice(start, end, blob.type || 'application/octet-stream');
    await postChunkWithRetry({
      uploadId,
      chunkIndex: i,
      chunkTotal,
      chunk,
      signal: options.signal,
    });
    bytesUploaded += chunk.size;
    options.onProgress?.({
      uploadId,
      bytesUploaded,
      totalBytes: blob.size,
      chunkIndex: i,
      chunkTotal,
    });
  }

  const finalizeRes = await fetch('/api/upload/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uploadId,
      filename,
      mimeType: blob.type || 'application/octet-stream',
    }),
    signal: options.signal,
  });
  if (!finalizeRes.ok) {
    const text = await finalizeRes.text().catch(() => '');
    throw new Error(`Finalize failed: ${finalizeRes.status} ${text || finalizeRes.statusText}`);
  }
  const json = (await finalizeRes.json()) as { success: boolean; size: number; message?: string };
  if (!json.success) {
    throw new Error(json.message || 'Finalize failed');
  }
  return { uploadId, size: json.size };
}

/** Convert a `data:image/...;base64,...` URL into a typed Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid data URL');
  const mime = match[1] || 'application/octet-stream';
  const isBase64 = !!match[2];
  const data = match[3] || '';
  const bytes = isBase64
    ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(data));
  return new Blob([bytes], { type: mime });
}
