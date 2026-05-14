import { Canvas, FabricImage } from 'fabric';
import {
  buildImageFilters,
  DEFAULT_IMAGE_ADJUSTMENTS,
  mergeImageAdjustments,
  type ImageAdjustments,
} from '@/lib/imageAdjustments';

export type ExportFormat = 'png' | 'jpeg';

export type ExportOptions = {
  /** Final canvas height before applying the multiplier (Standard 560, Japanese 575). */
  height?: number;
  /** Output multiplier — 4 gives a print-friendly resolution. */
  multiplier?: number;
  /**
   * Output format. Default is `png` for lossless output, as required by the
   * production print pipeline. Use `jpeg` only when a smaller file is needed.
   */
  format?: ExportFormat;
  /** Only consulted for JPEG. PNG ignores quality (always lossless). */
  jpegQuality?: number;
};

/**
 * Render a Fabric.js JSON state to a high-resolution DataURL.
 *
 * PNG output is lossless by spec (PNG uses Deflate, not lossy compression),
 * so it's the default for the print pipeline. JPEG is available as an opt-in.
 *
 * Runs in the browser.
 */
export async function exportDesignToHighRes(
  json: string,
  heightOrOptions: number | ExportOptions = 560,
  multiplierLegacy: number = 4
): Promise<string> {
  const opts: Required<ExportOptions> =
    typeof heightOrOptions === 'number'
      ? {
          height: heightOrOptions,
          multiplier: multiplierLegacy,
          format: 'png',
          jpegQuality: 1.0,
        }
      : {
          height: heightOrOptions.height ?? 560,
          multiplier: heightOrOptions.multiplier ?? 4,
          format: heightOrOptions.format ?? 'png',
          jpegQuality: heightOrOptions.jpegQuality ?? 1.0,
        };

  const tempElement = document.createElement('canvas');
  const CANVAS_WIDTH = 400;

  const canvas = new Canvas(tempElement, {
    width: CANVAS_WIDTH,
    height: opts.height,
  });

  try {
    await canvas.loadFromJSON(JSON.parse(json));

    canvas.getObjects().forEach((obj) => {
      if (String((obj as { type?: string }).type || '').toLowerCase() !== 'image') return;
      if ((obj as { isFrame?: boolean }).isFrame) return;
      const img = obj as FabricImage & { imageAdjustments?: Partial<ImageAdjustments> };
      const adj = mergeImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS, img.imageAdjustments ?? {});
      img.imageAdjustments = adj;
      img.filters = buildImageFilters(adj);
      try {
        img.applyFilters();
      } catch {
        /* noop */
      }
    });

    canvas.renderAll();

    const dataUrl = canvas.toDataURL({
      format: opts.format,
      quality: opts.format === 'jpeg' ? opts.jpegQuality : 1,
      multiplier: opts.multiplier,
      enableRetinaScaling: true,
    });

    return dataUrl;
  } finally {
    canvas.dispose();
    tempElement.remove();
  }
}
