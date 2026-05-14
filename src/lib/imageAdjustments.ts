import { filters } from 'fabric';

export type ImageFilterMode = 'manual' | 'bw' | 'enhance';

export interface ImageAdjustments {
  sepia: number;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  mode: ImageFilterMode;
}

export const DEFAULT_IMAGE_ADJUSTMENTS: ImageAdjustments = {
  sepia: 0,
  brightness: 50,
  contrast: 50,
  saturation: 50,
  hue: 50,
  mode: 'manual',
};

const IDENTITY_MATRIX = [
  1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
];
const SEPIA_MATRIX = [
  0.393, 0.769, 0.189, 0, 0, 0.349, 0.686, 0.168, 0, 0, 0.272, 0.534, 0.131, 0, 0, 0, 0, 0, 1, 0,
];

function lerpSepiaMatrix(amount: number): number[] {
  const t = Math.max(0, Math.min(1, amount));
  return IDENTITY_MATRIX.map((v, i) => v * (1 - t) + SEPIA_MATRIX[i] * t);
}

/** Build Fabric filter list from adjustment UI (sliders 0–100, 50 = neutral where noted). */
export function buildImageFilters(adj: ImageAdjustments): filters.BaseFilter<string>[] {
  if (adj.mode === 'bw') {
    return [new filters.Grayscale()];
  }
  if (adj.mode === 'enhance') {
    return [
      new filters.Brightness({ brightness: 0.06 }),
      new filters.Contrast({ contrast: 0.12 }),
      new filters.Saturation({ saturation: 0.18 }),
    ];
  }

  const list: filters.BaseFilter<string>[] = [];
  const brightness = ((adj.brightness - 50) / 50) * 0.45;
  const contrast = ((adj.contrast - 50) / 50) * 0.55;
  const saturation = ((adj.saturation - 50) / 50) * 0.85;
  list.push(new filters.Brightness({ brightness }));
  list.push(new filters.Contrast({ contrast }));
  list.push(new filters.Saturation({ saturation }));

  const hueRot = ((adj.hue - 50) / 50) * Math.PI;
  if (Math.abs(hueRot) > 0.001) {
    list.push(new filters.HueRotation({ rotation: hueRot }));
  }

  if (adj.sepia > 0.5) {
    list.push(new filters.ColorMatrix({ matrix: lerpSepiaMatrix(adj.sepia / 100) }));
  }

  return list;
}

export function mergeImageAdjustments(
  prev: ImageAdjustments | undefined,
  patch: Partial<ImageAdjustments>
): ImageAdjustments {
  return { ...(prev ?? DEFAULT_IMAGE_ADJUSTMENTS), ...patch };
}
