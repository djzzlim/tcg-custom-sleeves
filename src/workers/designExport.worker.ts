/// <reference lib="webworker" />
/**
 * designExport.worker.ts
 *
 * Renders a Fabric.js canvas JSON snapshot to a high-resolution image
 * using OffscreenCanvas — entirely on a worker thread so the main thread
 * (and the Fabric editor canvas) stays responsive during design switches.
 *
 * Supported object types:
 *   - image / Image  (user photo + decorative frames)
 *   - i-text / IText
 *   - rect  / Rect   (treated as a filled rectangle)
 *
 * Image adjustments are applied as CSS filter strings via ctx.filter.
 * This matches the visual output of Fabric's built-in filters for the
 * Brightness / Contrast / Saturation / HueRotation / ColorMatrix (sepia)
 * filters used in this app.
 */

export type ExportWorkerRequest = {
  /** Unique request id so concurrent requests can be correlated. */
  id: string;
  /** Serialised Fabric.js canvas JSON (canvas.toObject(...)). */
  fabricJson: string;
  /** Logical canvas width (before multiplier). */
  width: number;
  /** Logical canvas height (before multiplier). */
  height: number;
  /** Scale multiplier for print resolution (typically 4). */
  multiplier: number;
  /** Output image format. */
  format: 'png' | 'jpeg';
  /** JPEG quality 0–1 (ignored for PNG). */
  jpegQuality: number;
  /**
   * Design-level image adjustments to apply to every user photo.
   * Sliders use the same 0–100 scale as the UI (50 = neutral).
   */
  imageAdjustments?: SerializedAdjustments;
  /** Base URL of the app (e.g. "https://example.com") for fetching frame SVGs. */
  baseUrl: string;
};

export type ExportWorkerResponse = {
  id: string;
  /** Transferred ArrayBuffer containing the encoded image bytes on success. */
  buffer?: ArrayBuffer;
  mimeType: string;
  error?: string;
};

/** Mirror of the app's ImageAdjustments (0–100 sliders, 50 = neutral). */
type SerializedAdjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  sepia: number;
  mode: 'manual' | 'bw' | 'enhance';
};

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

/**
 * Convert ImageAdjustments (0–100 sliders, 50 = neutral) to a CSS filter
 * string that can be assigned to `ctx.filter` before drawing an image.
 *
 * The mapping mirrors buildImageFilters() in imageAdjustments.ts so the
 * visual result is equivalent to Fabric's GPU-accelerated filter pipeline.
 *
 *  Fabric Brightness: brightness param is -1…1  (0.45 max swing)
 *  CSS   brightness(): 0 = black, 1 = original, 2 = double
 *    → css = 1 + fabricValue
 *
 *  Fabric Contrast: contrast param is -1…1  (0.55 max swing)
 *  CSS   contrast(): 0 = grey, 1 = original
 *    → css = 1 + fabricValue
 *
 *  Fabric Saturation: saturation param is -1…1  (0.85 max swing)
 *  CSS   saturate(): 0 = greyscale, 1 = original
 *    → css = 1 + fabricValue
 *
 *  Fabric HueRotation: rotation is in radians (-π…π)
 *  CSS   hue-rotate(): degrees
 *    → css = radians * (180/π)
 *
 *  Sepia: linearly blended matrix applied as CSS sepia() is a close enough
 *  approximation for preview purposes.
 */
function adjustmentsToCssFilter(adj: SerializedAdjustments): string {
  if (adj.mode === 'bw') {
    return 'grayscale(1)';
  }
  if (adj.mode === 'enhance') {
    // Fabric enhance preset: brightness +0.06, contrast +0.12, saturation +0.18
    return 'brightness(1.06) contrast(1.12) saturate(1.18)';
  }

  const parts: string[] = [];

  const brightness = ((adj.brightness - 50) / 50) * 0.45;
  const contrast   = ((adj.contrast - 50) / 50) * 0.55;
  const saturation = ((adj.saturation - 50) / 50) * 0.85;
  const hueRad     = ((adj.hue - 50) / 50) * Math.PI;

  parts.push(`brightness(${(1 + brightness).toFixed(4)})`);
  parts.push(`contrast(${(1 + contrast).toFixed(4)})`);
  parts.push(`saturate(${(1 + saturation).toFixed(4)})`);

  if (Math.abs(hueRad) > 0.001) {
    const hueDeg = hueRad * (180 / Math.PI);
    parts.push(`hue-rotate(${hueDeg.toFixed(2)}deg)`);
  }

  if (adj.sepia > 0.5) {
    parts.push(`sepia(${(adj.sepia / 100).toFixed(3)})`);
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Image cache (within a single render so we don't re-fetch the same src)
// ---------------------------------------------------------------------------
const bitmapCache = new Map<string, ImageBitmap>();

async function fetchBitmap(src: string, baseUrl: string): Promise<ImageBitmap | null> {
  const key = src;
  if (bitmapCache.has(key)) return bitmapCache.get(key)!;

  try {
    let url = src;
    // Relative paths (frame SVGs like /frames/01.svg?v=8) → absolute URL
    if (src.startsWith('/')) {
      url = baseUrl + src;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    bitmapCache.set(key, bitmap);
    return bitmap;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Object renderers
// ---------------------------------------------------------------------------

type FabricObj = Record<string, unknown>;

/**
 * Resolve the actual top-left corner from a Fabric object's left/top/origin.
 * Fabric stores position at the object's origin point.
 */
function resolveTopLeft(
  left: number,
  top: number,
  originX: string,
  originY: string,
  scaledW: number,
  scaledH: number,
): [number, number] {
  let x = left;
  let y = top;
  if (originX === 'center') x -= scaledW / 2;
  else if (originX === 'right') x -= scaledW;

  if (originY === 'center') y -= scaledH / 2;
  else if (originY === 'bottom') y -= scaledH;

  return [x, y];
}

async function renderImage(
  ctx: OffscreenCanvasRenderingContext2D,
  obj: FabricObj,
  designAdj: SerializedAdjustments | undefined,
  baseUrl: string,
) {
  const src = obj['src'] as string | undefined;
  if (!src) return;

  const bitmap = await fetchBitmap(src, baseUrl);
  if (!bitmap) return;

  const scaleX   = (obj['scaleX'] as number | undefined) ?? 1;
  const scaleY   = (obj['scaleY'] as number | undefined) ?? 1;
  const left     = (obj['left'] as number | undefined) ?? 0;
  const top      = (obj['top']  as number | undefined) ?? 0;
  const originX  = (obj['originX'] as string | undefined) ?? 'left';
  const originY  = (obj['originY'] as string | undefined) ?? 'top';
  const angle    = (obj['angle'] as number | undefined) ?? 0;
  const opacity  = (obj['opacity'] as number | undefined) ?? 1;
  const isFrame  = Boolean(obj['isFrame']);

  const scaledW = bitmap.width  * scaleX;
  const scaledH = bitmap.height * scaleY;
  const [tlX, tlY] = resolveTopLeft(left, top, originX, originY, scaledW, scaledH);

  ctx.save();

  // Apply opacity
  ctx.globalAlpha = opacity;

  // Apply image adjustments via CSS filter (user photos only, not frames)
  if (!isFrame) {
    const adj = designAdj ?? (obj['imageAdjustments'] as SerializedAdjustments | undefined);
    if (adj) {
      ctx.filter = adjustmentsToCssFilter(adj);
    }
  }

  // Translate to the object's top-left, rotate around its centre
  const cx = tlX + scaledW / 2;
  const cy = tlY + scaledH / 2;
  ctx.translate(cx, cy);
  if (angle) ctx.rotate((angle * Math.PI) / 180);
  ctx.translate(-scaledW / 2, -scaledH / 2);

  ctx.drawImage(bitmap, 0, 0, scaledW, scaledH);

  ctx.restore();
}

async function renderText(
  ctx: OffscreenCanvasRenderingContext2D,
  obj: FabricObj,
) {
  const text        = (obj['text'] as string | undefined) ?? '';
  const left        = (obj['left'] as number | undefined) ?? 0;
  const top         = (obj['top']  as number | undefined) ?? 0;
  const originX     = (obj['originX'] as string | undefined) ?? 'left';
  const originY     = (obj['originY'] as string | undefined) ?? 'top';
  const angle       = (obj['angle'] as number | undefined) ?? 0;
  const fontSize    = (obj['fontSize'] as number | undefined) ?? 20;
  const fontFamily  = (obj['fontFamily'] as string | undefined) ?? 'sans-serif';
  const fontWeight  = (obj['fontWeight'] as string | number | undefined) ?? 'normal';
  const fontStyle   = (obj['fontStyle'] as string | undefined) ?? 'normal';
  const fill        = (obj['fill'] as string | undefined) ?? '#000';
  const stroke      = (obj['stroke'] as string | undefined);
  const strokeWidth = (obj['strokeWidth'] as number | undefined) ?? 0;
  const opacity     = (obj['opacity'] as number | undefined) ?? 1;
  const textAlign   = (obj['textAlign'] as CanvasTextAlign | undefined) ?? 'left';
  const paintFirst  = (obj['paintFirst'] as string | undefined) ?? 'fill';
  const bgColor     = obj['backgroundColor'] as string | undefined;
  const underline   = Boolean(obj['underline']);

  const fontDef = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}"`;
  ctx.save();
  ctx.font        = fontDef;
  ctx.globalAlpha = opacity;

  // Measure for layout
  const lines = text.split('\n');
  const lineH  = fontSize * 1.16; // approximate Fabric line-height
  const totalH = lineH * lines.length;

  // For simplicity, use the longest line for width calculation
  let maxW = 0;
  for (const line of lines) {
    const m = ctx.measureText(line);
    if (m.width > maxW) maxW = m.width;
  }

  // Resolve position (Fabric i-text uses originX/Y on its bounding box)
  const [tlX, tlY] = resolveTopLeft(left, top, originX, originY, maxW, totalH);
  const cx = tlX + maxW / 2;
  const cy = tlY + totalH / 2;

  ctx.translate(cx, cy);
  if (angle) ctx.rotate((angle * Math.PI) / 180);
  ctx.translate(-maxW / 2, -totalH / 2);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineY = i * lineH + fontSize; // baseline

    // Background per-line
    if (bgColor) {
      const m = ctx.measureText(line);
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, lineY - fontSize, m.width, lineH);
    }

    ctx.textAlign = textAlign === 'center' ? 'center' : textAlign === 'right' ? 'right' : 'left';
    const lineX = textAlign === 'center' ? maxW / 2 : textAlign === 'right' ? maxW : 0;

    const doStroke = stroke && strokeWidth > 0;

    if (paintFirst === 'stroke' && doStroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth   = strokeWidth * 2;
      ctx.strokeText(line, lineX, lineY);
    }

    ctx.fillStyle = fill;
    ctx.fillText(line, lineX, lineY);

    if (paintFirst !== 'stroke' && doStroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth   = strokeWidth * 2;
      ctx.strokeText(line, lineX, lineY);
    }

    if (underline) {
      const m = ctx.measureText(line);
      ctx.fillStyle = fill;
      ctx.fillRect(lineX - (textAlign === 'center' ? m.width / 2 : 0), lineY + 2, m.width, 1.5);
    }
  }

  ctx.restore();
}

function renderRect(
  ctx: OffscreenCanvasRenderingContext2D,
  obj: FabricObj,
) {
  const left    = (obj['left']   as number | undefined) ?? 0;
  const top     = (obj['top']    as number | undefined) ?? 0;
  const width   = (obj['width']  as number | undefined) ?? 0;
  const height  = (obj['height'] as number | undefined) ?? 0;
  const fill    = (obj['fill']   as string | undefined) ?? 'transparent';
  const opacity = (obj['opacity'] as number | undefined) ?? 1;
  const angle   = (obj['angle']  as number | undefined) ?? 0;

  const scaleX  = (obj['scaleX']  as number | undefined) ?? 1;
  const scaleY  = (obj['scaleY']  as number | undefined) ?? 1;
  const originX = (obj['originX'] as string | undefined) ?? 'left';
  const originY = (obj['originY'] as string | undefined) ?? 'top';

  const scaledW = width  * scaleX;
  const scaledH = height * scaleY;
  const [tlX, tlY] = resolveTopLeft(left, top, originX, originY, scaledW, scaledH);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(tlX + scaledW / 2, tlY + scaledH / 2);
  if (angle) ctx.rotate((angle * Math.PI) / 180);
  ctx.fillStyle = fill;
  ctx.fillRect(-scaledW / 2, -scaledH / 2, scaledW, scaledH);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Main render pipeline
// ---------------------------------------------------------------------------

async function renderFabricJson(
  canvas: OffscreenCanvas,
  fabricJson: string,
  width: number,
  height: number,
  multiplier: number,
  designAdj: SerializedAdjustments | undefined,
  baseUrl: string,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context from OffscreenCanvas');

  const data = JSON.parse(fabricJson) as {
    background?: string;
    objects?: FabricObj[];
  };

  // Scale everything up for high-res output
  ctx.scale(multiplier, multiplier);

  // Background
  ctx.fillStyle = (data.background as string | undefined) ?? '#000000';
  ctx.fillRect(0, 0, width, height);

  const objects = data.objects ?? [];

  // Pre-fetch all image bitmaps in parallel for speed
  const imageSrcs = objects
    .filter((o) => {
      const t = String((o['type'] as string | undefined) ?? '').toLowerCase();
      return t === 'image';
    })
    .map((o) => o['src'] as string)
    .filter(Boolean);

  await Promise.allSettled(imageSrcs.map((src) => fetchBitmap(src, baseUrl)));

  // Render objects in order (bottom to top, matching Fabric stacking)
  for (const obj of objects) {
    const type = String((obj['type'] as string | undefined) ?? '').toLowerCase();
    if (type === 'image') {
      await renderImage(ctx, obj, designAdj, baseUrl);
    } else if (type === 'i-text' || type === 'text') {
      await renderText(ctx, obj);
    } else if (type === 'rect') {
      renderRect(ctx, obj);
    }
    // Unknown types are silently skipped
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = async (event: MessageEvent<ExportWorkerRequest>) => {
  const {
    id,
    fabricJson,
    width,
    height,
    multiplier,
    format,
    jpegQuality,
    imageAdjustments,
    baseUrl,
  } = event.data;

  // Clear per-request bitmap cache
  bitmapCache.clear();

  try {
    const canvas = new OffscreenCanvas(width * multiplier, height * multiplier);

    await renderFabricJson(
      canvas,
      fabricJson,
      width,
      height,
      multiplier,
      imageAdjustments,
      baseUrl,
    );

    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await canvas.convertToBlob({
      type: mimeType,
      quality: format === 'jpeg' ? jpegQuality : undefined,
    });
    const buffer = await blob.arrayBuffer();

    (self as unknown as Worker).postMessage(
      { id, buffer, mimeType } satisfies ExportWorkerResponse,
      // Transfer the buffer to avoid copying — the worker can't use it after this
      [buffer],
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id,
      mimeType: 'image/png',
      error: String(err),
    } satisfies ExportWorkerResponse);
  }
};
