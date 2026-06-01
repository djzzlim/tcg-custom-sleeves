/**
 * workerExport.ts
 *
 * Manages a singleton Web Worker that renders canvas JSON → high-res images
 * on a background thread using OffscreenCanvas.  The main thread is never
 * blocked by the heavy canvas.toDataURL() call.
 *
 * Falls back to the legacy main-thread exportDesignToHighRes() when:
 *   - OffscreenCanvas is not available (old browsers / Safari < 16.4)
 *   - The worker fails to initialise
 *   - The worker throws or rejects
 */

import type { ExportWorkerRequest, ExportWorkerResponse } from '@/workers/designExport.worker';
import type { ImageAdjustments } from '@/lib/imageAdjustments';
import { exportDesignToHighRes } from '@/lib/export';

// ---------------------------------------------------------------------------
// Worker singleton (created lazily, once, for the page lifetime)
// ---------------------------------------------------------------------------

let _worker: Worker | null = null;
let _workerFailed = false;

function getWorker(): Worker | null {
  if (_workerFailed) return null;
  if (_worker) return _worker;

  if (typeof window === 'undefined') return null;          // SSR guard
  if (typeof OffscreenCanvas === 'undefined') return null; // browser support guard

  try {
    _worker = new Worker(
      new URL('../workers/designExport.worker', import.meta.url),
      { type: 'module' },
    );

    _worker.onerror = () => {
      console.warn('[WorkerExport] Worker error — falling back to main thread for future exports.');
      _workerFailed = true;
      _worker = null;
    };

    return _worker;
  } catch {
    _workerFailed = true;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pending request registry
// ---------------------------------------------------------------------------

type Pending = {
  resolve: (result: { dataUrl: string; mimeType: string }) => void;
  reject: (err: Error) => void;
};

const pending = new Map<string, Pending>();
let _messageListenerAttached = false;

function attachMessageListener(worker: Worker) {
  if (_messageListenerAttached) return;
  _messageListenerAttached = true;

  worker.addEventListener('message', (e: MessageEvent<ExportWorkerResponse>) => {
    const { id, buffer, mimeType, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);

    if (error || !buffer) {
      p.reject(new Error(error ?? 'Worker returned no buffer'));
      return;
    }

    // Convert ArrayBuffer → data URL
    const blob    = new Blob([buffer], { type: mimeType });
    const reader  = new FileReader();
    reader.onload = () => p.resolve({ dataUrl: reader.result as string, mimeType });
    reader.onerror = () => p.reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let _requestCounter = 0;

/**
 * Export a canvas JSON snapshot to a high-res data URL.
 *
 * When a background worker is available the rendering happens off the main
 * thread; otherwise it falls back to the original Fabric-based renderer.
 *
 * @returns `{ dataUrl, mimeType }` where dataUrl is a base-64 encoded image.
 */
export async function exportDesignToHighResWorker(params: {
  canvasData: string;
  height: number;
  multiplier: number;
  format: 'png' | 'jpeg';
  jpegQuality?: number;
  imageAdjustments?: ImageAdjustments;
}): Promise<{ dataUrl: string; mimeType: string }> {
  const { canvasData, height, multiplier, format, jpegQuality = 0.95, imageAdjustments } = params;

  const worker = getWorker();

  // ── Worker path ───────────────────────────────────────────────────────────
  if (worker) {
    if (!_messageListenerAttached) attachMessageListener(worker);

    const id = `export-${Date.now()}-${++_requestCounter}`;

    const req: ExportWorkerRequest = {
      id,
      fabricJson: canvasData,
      width: 400,            // CANVAS_WIDTH is always 400 in this app
      height,
      multiplier,
      format,
      jpegQuality,
      imageAdjustments: imageAdjustments as ExportWorkerRequest['imageAdjustments'],
      baseUrl: window.location.origin,
    };

    return new Promise<{ dataUrl: string; mimeType: string }>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage(req);
    });
  }

  // ── Main-thread fallback ──────────────────────────────────────────────────
  const mimeType  = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const dataUrl   = await exportDesignToHighRes(canvasData, {
    height,
    multiplier,
    format,
    jpegQuality,
    ...(imageAdjustments ? { imageAdjustments } : {}),
  });

  return { dataUrl, mimeType };
}
