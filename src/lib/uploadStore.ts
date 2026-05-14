/**
 * In-memory upload buffer for chunked design uploads.
 *
 * NOTE: this lives in the Node process memory, so it works in `next dev` and
 * single-instance deployments. For multi-instance serverless deployments,
 * swap the implementation with a shared store (Vercel KV, Redis, S3, Drive).
 */

const HALF_HOUR_MS = 30 * 60 * 1000;

export type UploadEntry = {
  /** Indexed by chunk number — sparse until all chunks arrive. */
  chunks: (Uint8Array | undefined)[];
  /** Total chunks expected. */
  total: number;
  /** Final mime type (sent by client at finalize time). */
  mimeType?: string;
  /** Final filename (sent by client at finalize time). */
  filename?: string;
  /** Assembled bytes after finalize. Cleared once consumed. */
  assembled?: Uint8Array;
  createdAt: number;
};

const store = new Map<string, UploadEntry>();

/** Drop entries older than 30 minutes to avoid leaks during long sessions. */
function evictStale() {
  const cutoff = Date.now() - HALF_HOUR_MS;
  for (const [id, entry] of store) {
    if (entry.createdAt < cutoff) store.delete(id);
  }
}

export function putChunk(
  uploadId: string,
  chunkIndex: number,
  chunkTotal: number,
  bytes: Uint8Array
): UploadEntry {
  evictStale();
  let entry = store.get(uploadId);
  if (!entry) {
    entry = {
      chunks: new Array(chunkTotal),
      total: chunkTotal,
      createdAt: Date.now(),
    };
    store.set(uploadId, entry);
  } else if (entry.total !== chunkTotal) {
    throw new Error(
      `Chunk total mismatch for upload ${uploadId}: had ${entry.total}, got ${chunkTotal}`
    );
  }
  if (chunkIndex < 0 || chunkIndex >= chunkTotal) {
    throw new Error(`Chunk index ${chunkIndex} out of range [0, ${chunkTotal})`);
  }
  entry.chunks[chunkIndex] = bytes;
  return entry;
}

export function finalizeUpload(
  uploadId: string,
  meta: { mimeType?: string; filename?: string }
): { size: number; mimeType?: string; filename?: string } {
  const entry = store.get(uploadId);
  if (!entry) throw new Error(`Unknown upload id ${uploadId}`);
  for (let i = 0; i < entry.total; i++) {
    if (!entry.chunks[i]) {
      throw new Error(`Missing chunk ${i} for upload ${uploadId}`);
    }
  }
  const totalSize = entry.chunks.reduce((sum, c) => sum + (c?.byteLength ?? 0), 0);
  const assembled = new Uint8Array(totalSize);
  let offset = 0;
  for (const c of entry.chunks) {
    assembled.set(c!, offset);
    offset += c!.byteLength;
  }
  entry.assembled = assembled;
  entry.mimeType = meta.mimeType;
  entry.filename = meta.filename;
  entry.chunks = [];
  return { size: assembled.byteLength, mimeType: entry.mimeType, filename: entry.filename };
}

export function takeAssembled(uploadId: string): UploadEntry | undefined {
  const entry = store.get(uploadId);
  if (!entry || !entry.assembled) return undefined;
  store.delete(uploadId);
  return entry;
}

export function peekAssembled(uploadId: string): UploadEntry | undefined {
  const entry = store.get(uploadId);
  if (!entry || !entry.assembled) return undefined;
  return entry;
}
