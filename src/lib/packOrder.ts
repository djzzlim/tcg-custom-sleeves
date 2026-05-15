import type { Pack, SleeveCopy, SleeveDesign } from '@/store/useStore';

/** A pack holds either 65 or 110 sleeves. An order can contain many packs. */
export const ORDER_PACK_SIZES = [65, 110] as const;
export type OrderPackSize = (typeof ORDER_PACK_SIZES)[number];

export const DEFAULT_ORDER_PACK_SIZE: OrderPackSize = 65;
export const MAX_ORDER_PACK_SIZE = 110;

export function isOrderPackSize(n: number): n is OrderPackSize {
  return n === 65 || n === 110;
}

/** Block the next upload once session count reaches the total order capacity. */
export function shouldBlockNextImageUpload(
  packs: Pack[],
  sessionImageUploadCount: number
): boolean {
  return sessionImageUploadCount >= totalOrderSleeves(packs);
}

/** Sum of all pack sizes — used as the upload cap. */
export function totalOrderSleeves(packs: Pack[]): number {
  return packs.reduce((sum, p) => sum + p.size, 0);
}

/** User-uploaded image on canvas (excludes decorative frame layer). */
export function canvasHasUserPhoto(canvasData: string | undefined): boolean {
  if (!canvasData) return false;
  try {
    const parsed = JSON.parse(canvasData) as { objects?: unknown[] };
    const objs = parsed.objects;
    if (!Array.isArray(objs)) return false;
    return objs.some((obj) => {
      if (!obj || typeof obj !== 'object') return false;
      const any = obj as { type?: string; isFrame?: boolean };
      if (any.isFrame) return false;
      return String(any.type || '').toLowerCase() === 'image';
    });
  } catch {
    return false;
  }
}

/** Whether the active design already has a user photo (re-upload replaces, not adds). */
export function designHasUserPhoto(design: SleeveDesign | undefined): boolean {
  if (!design) return false;
  return canvasHasUserPhoto(design.canvasData);
}

export function sleeveCopiesForDesign(s: SleeveDesign): SleeveCopy[] {
  const quantity = Math.max(0, Math.floor(s.quantity ?? 0));
  return Array.from({ length: quantity }, (_, index) => (
    s.sleeveCopies?.[index] ?? { id: `${s.id}-copy-${index + 1}` }
  ));
}

export function sleeveCopyCanvasData(
  design: SleeveDesign,
  copy?: SleeveCopy | null
): string | undefined {
  return copy?.canvasData ?? design.canvasData;
}

export function sleeveCopyPreviewUrl(
  design: SleeveDesign,
  copy?: SleeveCopy | null
): string | undefined {
  return copy?.previewUrl ?? design.previewUrl;
}

export function isPackDesignComplete(s: SleeveDesign): boolean {
  if (s.canvasData && canvasHasUserPhoto(s.canvasData)) return true;
  const copies = sleeveCopiesForDesign(s);
  return copies.length > 0 && copies.every((copy) => canvasHasUserPhoto(copy.canvasData));
}

export function designsInPack(
  sleeves: SleeveDesign[],
  packId: string
): SleeveDesign[] {
  return sleeves.filter((s) => s.packId === packId);
}

export function totalSleevesAssigned(designs: SleeveDesign[]): number {
  return designs.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
}

export function remainingSleevesForPack(
  designs: SleeveDesign[],
  packSize: OrderPackSize
): number {
  return Math.max(0, packSize - totalSleevesAssigned(designs));
}

/** Max quantity a single design can take = packSize - other designs' quantities (min 1). */
export function maxQuantityForDesignInPack(
  designs: SleeveDesign[],
  designId: string,
  packSize: OrderPackSize
): number {
  const others = designs.reduce(
    (sum, s) => (s.id === designId ? sum : sum + (s.quantity ?? 0)),
    0
  );
  return Math.max(1, packSize - others);
}

export function getPackForDesign(
  packs: Pack[],
  sleeves: SleeveDesign[],
  designId: string | null
): Pack | undefined {
  if (!designId) return undefined;
  const d = sleeves.find((s) => s.id === designId);
  if (!d) return undefined;
  return packs.find((p) => p.id === d.packId);
}

export function orderMeetsPackRequirements(
  packs: Pack[],
  sleeves: SleeveDesign[]
): { ok: true } | { ok: false; message: string } {
  if (packs.length === 0) {
    return {
      ok: false,
      message: 'Create at least one pack before checkout.',
    };
  }
  for (const pack of packs) {
    const designs = designsInPack(sleeves, pack.id);
    if (designs.length === 0) {
      return {
        ok: false,
        message: `Add a design to "${pack.name}".`,
      };
    }
    for (const d of designs) {
      if (!isPackDesignComplete(d)) {
        return {
          ok: false,
          message: `Add a photo to "${d.name}" in "${pack.name}".`,
        };
      }
      if ((d.quantity ?? 0) < 1) {
        return {
          ok: false,
          message: `"${d.name}" in "${pack.name}" needs at least 1 sleeve.`,
        };
      }
    }
    const total = totalSleevesAssigned(designs);
    if (total !== pack.size) {
      return {
        ok: false,
        message: `"${pack.name}" has ${total}/${pack.size} sleeves assigned — adjust quantities so they total ${pack.size}.`,
      };
    }
  }
  return { ok: true };
}
