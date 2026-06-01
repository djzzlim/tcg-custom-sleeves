import { exportDesignToHighResWorker } from '@/lib/workerExport';
import { dataUrlToBlob, MAX_OUTPUT_BYTES } from '@/lib/chunkedUpload';
import type { ImageAdjustments } from '@/lib/imageAdjustments';
import { useStore, type SleeveDesign } from '@/store/useStore';

export function canvasJsonHasUserPhoto(json: string): boolean {
  try {
    const data = JSON.parse(json) as { objects?: Array<{ type?: string; isFrame?: boolean }> };
    return (data.objects ?? []).some((o) => {
      if (o.isFrame) return false;
      return String(o.type || '').toLowerCase() === 'image';
    });
  } catch {
    return false;
  }
}

export async function uploadDesignAutoSave(params: {
  canvasJson: string;
  jsonKey: string;
}): Promise<boolean> {
  const response = await fetch('/api/upload/auto-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    console.warn(`[S3 Auto-Save] Upload skipped (${response.status}):`, await response.text());
    return false;
  }
  return true;
}

export type HighResUploadResult = {
  s3Key: string;
  mimeType: string;
  size: number;
};

const highResUploadInflight = new Map<string, Promise<HighResUploadResult | null>>();

/** Export canvas JSON to print-ready file and upload to S3. Runs in the browser. */
export async function uploadDesignHighRes(params: {
  purchaseId: string;
  designId: string;
  canvasData: string;
  sleeveType: 'Standard' | 'Japanese';
  imageAdjustments?: ImageAdjustments;
}): Promise<HighResUploadResult | null> {
  const inflightKey = `${params.purchaseId}:${params.designId}`;
  const pending = highResUploadInflight.get(inflightKey);
  if (pending) return pending;

  const work = (async (): Promise<HighResUploadResult | null> => {
  const height = params.sleeveType === 'Japanese' ? 575 : 560;
  let format: 'png' | 'jpeg' = 'png';
  let mimeType = 'image/png';
  let s3Key = `designs/${params.purchaseId}/${params.designId}_highres.png`;

  const exportOpts = {
    height,
    multiplier: 4 as const,
    ...(params.imageAdjustments !== undefined
      ? { imageAdjustments: params.imageAdjustments }
      : {}),
  };

  // Export via Web Worker (OffscreenCanvas) so the main thread stays free.
  // Falls back to the Fabric-based renderer if the worker is unavailable.
  let exportResult = await exportDesignToHighResWorker({
    canvasData: params.canvasData,
    ...exportOpts,
    format: 'png',
  });
  let blob = dataUrlToBlob(exportResult.dataUrl);

  // Optimize size: if the lossless PNG exceeds 1.5 MB, switch to 95 % JPEG
  // to shrink the file by ~80 % and make upload lightning fast.
  const LARGE_PNG_LIMIT = 1.5 * 1024 * 1024;
  if (blob.size > LARGE_PNG_LIMIT) {
    exportResult = await exportDesignToHighResWorker({
      canvasData: params.canvasData,
      ...exportOpts,
      format: 'jpeg',
      jpegQuality: 0.95,
    });
    blob = dataUrlToBlob(exportResult.dataUrl);
    format = 'jpeg';
    mimeType = 'image/jpeg';
    s3Key = `designs/${params.purchaseId}/${params.designId}_highres.jpg`;
  }

  if (blob.size > MAX_OUTPUT_BYTES) {
    throw new Error(
      `Print output exceeds the ${MAX_OUTPUT_BYTES / 1024 / 1024} MB limit (${(blob.size / 1024 / 1024).toFixed(1)} MB).`
    );
  }

  // Upload via local API proxy route (server-side S3 credentials, no CORS issues)
  const uploadForm = new FormData();
  uploadForm.append('key', s3Key);
  uploadForm.append('contentType', mimeType);
  uploadForm.append('file', blob, s3Key.split('/').pop() ?? `highres.${format}`);

  const uploadRes = await fetch('/api/upload/high-res', {
    method: 'POST',
    body: uploadForm,
  });

  if (!uploadRes.ok) {
    console.warn('[S3 Upload] Local proxy upload failed:', await uploadRes.text());
    return null;
  }

  console.log(`[S3 High-Res] Uploaded design ${params.designId} → ${s3Key}`);
  return { s3Key, mimeType, size: blob.size };
  })();

  highResUploadInflight.set(inflightKey, work);
  try {
    return await work;
  } finally {
    if (highResUploadInflight.get(inflightKey) === work) {
      highResUploadInflight.delete(inflightKey);
    }
  }
}

export function designHighResMatchesCanvas(
  design: SleeveDesign,
  canvasData: string
): design is SleeveDesign & { highResS3Key: string; highResMimeType: string; highResSize: number } {
  return (
    Boolean(design.highResS3Key) &&
    design.highResCanvasData === canvasData &&
    typeof design.highResMimeType === 'string' &&
    typeof design.highResSize === 'number'
  );
}

/** Use cached S3 high-res when canvas unchanged; otherwise export + upload. */
export async function resolveDesignHighResUpload(params: {
  purchaseId: string;
  design: SleeveDesign;
  canvasData: string;
  sleeveType: 'Standard' | 'Japanese';
}): Promise<{ uploadId: string; mimeType: string; size: number }> {
  const { purchaseId, design, canvasData, sleeveType } = params;

  if (designHighResMatchesCanvas(design, canvasData)) {
    return {
      uploadId: design.highResS3Key,
      mimeType: design.highResMimeType,
      size: design.highResSize,
    };
  }

  const uploaded = await uploadDesignHighRes({
    purchaseId,
    designId: design.id,
    canvasData,
    sleeveType,
    ...(design.imageAdjustments !== undefined
      ? { imageAdjustments: design.imageAdjustments }
      : {}),
  });

  if (uploaded) {
    useStore.getState().updateSleeve(design.id, {
      highResS3Key: uploaded.s3Key,
      highResMimeType: uploaded.mimeType,
      highResSize: uploaded.size,
      highResCanvasData: canvasData,
    });
    return {
      uploadId: uploaded.s3Key,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
    };
  }

  const fallbackKey = `designs/${purchaseId}/${design.id}_highres.png`;
  console.warn(`[S3 High-Res] Falling back to high-res key for ${design.name}`);
  return { uploadId: fallbackKey, mimeType: 'image/png', size: 0 };
}

/** Preview + JSON auto-save, then high-res — call when leaving a design. */
export async function flushDesignToS3(params: {
  purchaseId: string;
  designId: string;
  copyId: string | null;
  canvasData: string;
  sleeveType: 'Standard' | 'Japanese';
  imageAdjustments?: ImageAdjustments;
}): Promise<void> {
  // Skip uploading if canvas is completely empty (no custom elements)
  try {
    const data = JSON.parse(params.canvasData) as { objects?: unknown[] };
    if (!data.objects || data.objects.length === 0) return;
  } catch {
    return;
  }

  const cached = useStore.getState().sleeves.find((s) => s.id === params.designId);
  if (cached?.highResCanvasData === params.canvasData && cached.highResS3Key) {
    return;
  }

  const suffix = params.copyId ? `_${params.copyId}` : '';
  const jsonKey = `designs/${params.purchaseId}/${params.designId}${suffix}_canvas.json`;

  await uploadDesignAutoSave({
    canvasJson: params.canvasData,
    jsonKey,
  });

  const highRes = await uploadDesignHighRes({
    purchaseId: params.purchaseId,
    designId: params.designId,
    canvasData: params.canvasData,
    sleeveType: params.sleeveType,
    ...(params.imageAdjustments !== undefined
      ? { imageAdjustments: params.imageAdjustments }
      : {}),
  });

  if (highRes) {
    useStore.getState().updateSleeve(params.designId, {
      highResS3Key: highRes.s3Key,
      highResMimeType: highRes.mimeType,
      highResSize: highRes.size,
      highResCanvasData: params.canvasData,
    });
  }
}
