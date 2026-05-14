import { create } from 'zustand';
import { DEFAULT_IMAGE_ADJUSTMENTS, type ImageAdjustments } from '@/lib/imageAdjustments';
import {
  type OrderPackSize,
  isOrderPackSize,
  designsInPack,
  maxQuantityForDesignInPack,
  totalSleevesAssigned,
} from '@/lib/packOrder';

export type EditorTab = 'Photos' | 'Frames' | 'Text' | null;

export interface Pack {
  id: string;
  name: string;
  size: OrderPackSize;
  sleeveType: 'Standard' | 'Japanese';
}

export interface SleeveCopy {
  id: string;
  canvasData?: string;
  previewUrl?: string;
}

export interface SleeveDesign {
  id: string;
  packId: string;
  name: string;
  canvasData?: string;
  previewUrl?: string;
  /** Sleeves inside the parent pack that use this design. Sums per pack must equal pack.size. */
  quantity?: number;
  sleeveCopies?: SleeveCopy[];
}

function createSleeveCopies(quantity: number, seed?: SleeveCopy[]): SleeveCopy[] {
  return Array.from({ length: quantity }, (_, index) => {
    const existing = seed?.[index];
    return existing ? { ...existing } : { id: crypto.randomUUID() };
  });
}

function resizeSleeveCopies(design: SleeveDesign, quantity: number): SleeveCopy[] {
  return createSleeveCopies(quantity, design.sleeveCopies);
}

interface AppState {
  purchaseId: string;
  /** All packs in the order. Each pack chooses its own size and sleeve cut. */
  packs: Pack[];
  /** Flat list of designs across all packs; each design references a pack via packId. */
  sleeves: SleeveDesign[];
  activeSleeveId: string | null;
  activeSleeveCopyId: string | null;
  /** Counts successful photo uploads in the editor (capped at sum of pack sizes per session). */
  sessionImageUploadCount: number;
  remarks: string;
  activeTab: EditorTab;
  /** Mobile-only: whether the order/preview bottom sheet is open. */
  mobileOrderOpen: boolean;

  // Editor state
  activeObjectType: string | null;
  photoAdjustments: ImageAdjustments;
  textProps: {
    fontFamily: string;
    fontSize: number;
    fill: string;
    stroke: string;
    strokeWidth: number;
    backgroundEnabled: boolean;
    backgroundColor: string;
    fontWeight: string | number;
    fontStyle: string;
    underline: boolean;
    textAlign: string;
  };

  // Actions
  incrementSessionImageUpload: () => void;
  /** Create a new pack with chosen size + cut and seed it with one full-size design. */
  createPack: (opts: { size: OrderPackSize; sleeveType: 'Standard' | 'Japanese' }) => void;
  removePack: (packId: string) => void;
  updatePack: (packId: string, data: Partial<Omit<Pack, 'id'>>) => void;
  /** Add another design inside the given pack using its remaining unassigned sleeves. */
  addDesignToPack: (packId: string) => void;
  /** Update how many sleeves of a design's pack use this design. Clamped to 1..(packSize - others). */
  setDesignQuantity: (designId: string, quantity: number) => void;
  updateSleeve: (id: string, data: Partial<SleeveDesign>) => void;
  updateSleeveCopy: (designId: string, copyId: string, data: Partial<SleeveCopy>) => void;
  /** Remove a design. If it was the last in its pack, the pack is also removed. */
  removeSleeve: (id: string) => void;
  setActiveSleeve: (id: string, copyId?: string) => void;
  setRemarks: (remarks: string) => void;
  generatePurchaseId: () => void;
  setActiveTab: (tab: EditorTab) => void;
  setMobileOrderOpen: (open: boolean) => void;
  setActiveObjectType: (type: string | null) => void;
  setTextProps: (props: Partial<AppState['textProps']>) => void;
  setPhotoAdjustments: (props: Partial<ImageAdjustments>) => void;
}

export const useStore = create<AppState>((set) => ({
  purchaseId: '',
  packs: [],
  sleeves: [],
  activeSleeveId: null,
  activeSleeveCopyId: null,
  sessionImageUploadCount: 0,
  remarks: '',
  activeTab: 'Photos',
  mobileOrderOpen: false,
  activeObjectType: null,
  photoAdjustments: { ...DEFAULT_IMAGE_ADJUSTMENTS },
  textProps: {
    fontFamily: 'Arial',
    fontSize: 32,
    fill: '#ffffff',
    stroke: '#000000',
    strokeWidth: 4,
    backgroundEnabled: false,
    backgroundColor: '#000000',
    fontWeight: 'normal',
    fontStyle: 'normal',
    underline: false,
    textAlign: 'center',
  },

  generatePurchaseId: () => {
    const id = 'PUR-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    set({ purchaseId: id });
  },

  incrementSessionImageUpload: () =>
    set((state) => ({ sessionImageUploadCount: state.sessionImageUploadCount + 1 })),

  createPack: ({ size, sleeveType }) =>
    set((state) => {
      if (!isOrderPackSize(size)) return state;
      const packId = crypto.randomUUID();
      const designId = crypto.randomUUID();
      const packIndex = state.packs.length + 1;
      const sleeveCopies = createSleeveCopies(size);
      return {
        packs: [
          ...state.packs,
          {
            id: packId,
            name: `Pack #${packIndex}`,
            size,
            sleeveType,
          },
        ],
        sleeves: [
          ...state.sleeves,
          {
            id: designId,
            packId,
            name: 'Design #1',
            quantity: size,
            sleeveCopies,
          },
        ],
        activeSleeveId: designId,
        activeSleeveCopyId: sleeveCopies[0]?.id ?? null,
      };
    }),

  removePack: (packId) =>
    set((state) => {
      const packIdx = state.packs.findIndex((p) => p.id === packId);
      if (packIdx === -1) return state;
      const newPacks = state.packs.filter((p) => p.id !== packId);
      const newSleeves = state.sleeves.filter((s) => s.packId !== packId);
      let nextActiveId: string | null = state.activeSleeveId;
      if (nextActiveId && !newSleeves.some((s) => s.id === nextActiveId)) {
        nextActiveId = newSleeves[0]?.id ?? null;
      }
      const nextActiveDesign = newSleeves.find((s) => s.id === nextActiveId);
      return {
        packs: newPacks,
        sleeves: newSleeves,
        activeSleeveId: nextActiveId,
        activeSleeveCopyId:
          nextActiveId === state.activeSleeveId
            ? state.activeSleeveCopyId
            : nextActiveDesign?.sleeveCopies?.[0]?.id ?? null,
      };
    }),

  updatePack: (packId, data) =>
    set((state) => ({
      packs: state.packs.map((p) => (p.id === packId ? { ...p, ...data } : p)),
    })),

  addDesignToPack: (packId) =>
    set((state) => {
      const pack = state.packs.find((p) => p.id === packId);
      if (!pack) return state;
      const packDesigns = designsInPack(state.sleeves, packId);
      const remaining = pack.size - totalSleevesAssigned(packDesigns);
      if (remaining <= 0) return state;
      const id = crypto.randomUUID();
      const nextIndex = packDesigns.length + 1;
      const sleeveCopies = createSleeveCopies(remaining);
      return {
        sleeves: [
          ...state.sleeves,
          {
            id,
            packId,
            name: `Design #${nextIndex}`,
            quantity: remaining,
            sleeveCopies,
          },
        ],
        activeSleeveId: id,
        activeSleeveCopyId: sleeveCopies[0]?.id ?? null,
      };
    }),

  setDesignQuantity: (designId, quantity) =>
    set((state) => {
      const design = state.sleeves.find((s) => s.id === designId);
      if (!design) return state;
      const pack = state.packs.find((p) => p.id === design.packId);
      if (!pack) return state;
      const packDesigns = designsInPack(state.sleeves, pack.id);
      const max = maxQuantityForDesignInPack(packDesigns, designId, pack.size);
      const clamped = Math.max(1, Math.min(max, Math.floor(quantity)));
      const resized = resizeSleeveCopies(design, clamped);
      const activeCopyStillExists =
        state.activeSleeveId !== designId ||
        !state.activeSleeveCopyId ||
        resized.some((copy) => copy.id === state.activeSleeveCopyId);
      return {
        sleeves: state.sleeves.map((s) =>
          s.id === designId ? { ...s, quantity: clamped, sleeveCopies: resized } : s
        ),
        activeSleeveCopyId: activeCopyStillExists ? state.activeSleeveCopyId : resized[0]?.id ?? null,
      };
    }),

  updateSleeve: (id, data) =>
    set((state) => ({
      sleeves: state.sleeves.map((s) => (s.id === id ? { ...s, ...data } : s)),
    })),

  updateSleeveCopy: (designId, copyId, data) =>
    set((state) => ({
      sleeves: state.sleeves.map((s) => {
        if (s.id !== designId) return s;
        const copies = resizeSleeveCopies(s, s.quantity ?? 0);
        const nextCopies = copies.map((copy) =>
          copy.id === copyId ? { ...copy, ...data } : copy
        );
        const seedDesignCanvas = !s.canvasData && data.canvasData && data.previewUrl;
        return {
          ...s,
          ...(seedDesignCanvas
            ? { canvasData: data.canvasData, previewUrl: data.previewUrl }
            : {}),
          sleeveCopies: nextCopies,
        };
      }),
    })),

  removeSleeve: (id) =>
    set((state) => {
      const design = state.sleeves.find((s) => s.id === id);
      if (!design) return state;
      const packDesigns = designsInPack(state.sleeves, design.packId);
      const isLastInPack = packDesigns.length === 1;

      const newSleeves = state.sleeves.filter((s) => s.id !== id);
      const newPacks = isLastInPack
        ? state.packs.filter((p) => p.id !== design.packId)
        : state.packs;

      let nextActiveId: string | null = state.activeSleeveId;
      if (nextActiveId === id) {
        if (!isLastInPack) {
          nextActiveId = packDesigns.find((d) => d.id !== id)?.id ?? null;
        } else {
          nextActiveId = newSleeves[0]?.id ?? null;
        }
      } else if (nextActiveId && !newSleeves.some((s) => s.id === nextActiveId)) {
        nextActiveId = newSleeves[0]?.id ?? null;
      }
      const nextActiveDesign = newSleeves.find((s) => s.id === nextActiveId);

      return {
        packs: newPacks,
        sleeves: newSleeves,
        activeSleeveId: nextActiveId,
        activeSleeveCopyId:
          nextActiveId === state.activeSleeveId
            ? state.activeSleeveCopyId
            : nextActiveDesign?.sleeveCopies?.[0]?.id ?? null,
      };
    }),

  setActiveSleeve: (id, copyId) =>
    set((state) => {
      const design = state.sleeves.find((s) => s.id === id);
      const copies = design ? resizeSleeveCopies(design, design.quantity ?? 0) : [];
      const nextCopyId = copyId ?? copies[0]?.id ?? null;
      return {
        sleeves: design && copies.length !== (design.sleeveCopies?.length ?? 0)
          ? state.sleeves.map((s) => (s.id === id ? { ...s, sleeveCopies: copies } : s))
          : state.sleeves,
        activeSleeveId: id,
        activeSleeveCopyId: nextCopyId,
      };
    }),

  setRemarks: (remarks) => set({ remarks }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setMobileOrderOpen: (open) => set({ mobileOrderOpen: open }),

  setActiveObjectType: (type) => set({ activeObjectType: type }),

  setTextProps: (props) =>
    set((state) => ({
      textProps: { ...state.textProps, ...props },
    })),

  setPhotoAdjustments: (props) =>
    set((state) => ({
      photoAdjustments: { ...state.photoAdjustments, ...props },
    })),
}));
