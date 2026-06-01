'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, type SleeveDesign } from '@/store/useStore';
import { CanvasAction, dispatchCanvasAction } from '@/lib/events';
import {
  buildImageFilters,
  DEFAULT_IMAGE_ADJUSTMENTS,
  mergeImageAdjustments,
  type ImageAdjustments,
} from '@/lib/imageAdjustments';
import { Canvas, IText, FabricImage, Rect, filters, FabricObject } from 'fabric';

// Register custom properties globally on FabricObject so they serialize and deserialize correctly
FabricObject.customProperties = ['isFrame', 'customColor', 'imageAdjustments'];
import { cn } from '@/lib/utils';
import TextCanvasToolbar from '@/components/Editor/TextCanvasToolbar';
import {
  canvasHasFrame,
  canvasHasUserPhoto,
  designHasUserPhoto,
  shouldBlockNextImageUpload,
  sleeveCopiesForDesign,
  sleeveCopyCanvasData,
  totalOrderSleeves,
} from '@/lib/packOrder';
import { validateUploadedImage } from '@/lib/imageValidation';
import { appAlert } from '@/lib/appDialog';
import { canvasJsonHasUserPhoto, flushDesignToS3 } from '@/lib/designS3Upload';


const CANVAS_WIDTH = 400;
/** Max undo steps kept per design (history is partitioned by sleeve id). */
const HISTORY_LIMIT = 50;

/**
 * Renders a fixed-resolution Fabric canvas at a CSS-scaled visual size so it
 * fits any viewport width. Fabric maps pointer events through
 * `getBoundingClientRect()`, so the transform doesn't break hit testing.
 *
 * The outer box reserves the scaled footprint in normal layout; the inner box
 * applies `transform: scale()` with `transformOrigin: top left`.
 */
function FluidCanvasFrame({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  const probeRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;
    const measure = () => {
      const availW = probe.clientWidth;
      if (availW <= 0) return;
      const scaleW = (availW - 4) / width;
      let next = scaleW;
      // Mobile only: also fit remaining vertical space between top/bottom chrome.
      const isMobileLayout =
        typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
      if (isMobileLayout) {
        const availH = probe.clientHeight;
        if (availH > 48) {
          next = Math.min(scaleW, (availH - 4) / height);
        }
      }
      setScale(Math.min(1, Math.max(0.1, next)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(probe);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, [width, height]);

  return (
    <div
      ref={probeRef}
      className="flex w-full min-h-0 flex-1 items-center justify-center lg:min-h-0 lg:flex-none"
    >
      <div
        style={{
          width: width * scale,
          height: height * scale,
          position: 'relative',
        }}
      >
        <div
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

type HistoryStacks = { undo: string[]; redo: string[] };
const CANVAS_JSON_PROPS = ['isFrame', 'customColor', 'imageAdjustments'] as const;

/** Fabric v7 uses `Image` / `image` for FabricImage; exclude decorative frames. */
function isUserLayerImage(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const any = obj as { type?: string; isFrame?: boolean };
  if (any.isFrame) return false;
  const t = String(any.type || '').toLowerCase();
  return t === 'image';
}

/** Serialized canvas includes a user photo (not just black background / frames). */

function removeUserLayerImages(cvs: Canvas) {
  cvs.getObjects().filter(isUserLayerImage).forEach((obj) => cvs.remove(obj));
}

/**
 * Re-applies all non-serialized lock, scaling, and eventing properties
 * to the frame and user layers after standard loadFromJSON runs.
 */
function restoreLockedProperties(cvs: Canvas) {
  cvs.getObjects().forEach((obj) => {
    if ((obj as any).isFrame) {
      obj.set({
        selectable: true,
        evented: true,
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        hasControls: false,
        hasBorders: true,
        perPixelTargetFind: true, // Click-through transparent center to select image behind
        hoverCursor: 'default',
      });
    } else if (isUserLayerImage(obj)) {
      obj.set({
        selectable: true,
        evented: true,
        hasControls: false,
        hasBorders: false,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        hoverCursor: 'move',
      });
    }
  });
}

function applyCoverLayout(img: FabricImage, cvsHeight: number) {
  const targetW = CANVAS_WIDTH;
  const targetH = cvsHeight;
  img.set({ scaleX: 1, scaleY: 1 });
  const baseW = img.getScaledWidth() || targetW;
  const baseH = img.getScaledHeight() || targetH;
  const scale = Math.max(targetW / baseW, targetH / baseH);
  img.set({
    scaleX: scale,
    scaleY: scale,
    left: CANVAS_WIDTH / 2,
    top: cvsHeight / 2,
    originX: 'center',
    originY: 'center',
    selectable: true,
    evented: true,
    hasControls: false,
    hasBorders: false,
    lockMovementY: true,
    lockMovementX: false,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    hoverCursor: 'move',
  });
}

function applyUserImageAdjustments(img: FabricImage, adj: ImageAdjustments) {
  (img as FabricImage & { imageAdjustments: ImageAdjustments }).imageAdjustments = adj;
  img.filters = buildImageFilters(adj);
  try {
    img.applyFilters();
  } catch {
    /* noop */
  }
}

/** Active user image, or the topmost user image in stacking order (for sidebar filters). */
function getTargetUserImage(cvs: Canvas): FabricImage | null {
  const active = cvs.getActiveObject();
  if (active && isUserLayerImage(active)) return active as FabricImage;
  const objs = cvs.getObjects();
  for (let i = objs.length - 1; i >= 0; i--) {
    if (isUserLayerImage(objs[i])) return objs[i] as FabricImage;
  }
  return null;
}

function reapplyLoadedImageFilters(cvs: Canvas) {
  cvs.getObjects().forEach((obj) => {
    if (!isUserLayerImage(obj)) return;
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
}

/** One shared photo filter per design: all user images get the same adjustments. */
function applyDesignPhotoFiltersToCanvas(cvs: Canvas, design: SleeveDesign | undefined) {
  if (design?.imageAdjustments !== undefined) {
    const merged = mergeImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS, design.imageAdjustments);
    cvs.getObjects().forEach((obj) => {
      if (!isUserLayerImage(obj)) return;
      const img = obj as FabricImage & { imageAdjustments: ImageAdjustments };
      img.imageAdjustments = merged;
      img.filters = buildImageFilters(merged);
      try {
        img.applyFilters();
      } catch {
        /* noop */
      }
    });
  } else {
    reapplyLoadedImageFilters(cvs);
  }
}

export default function CanvasEditor({ isMobileView = false }: { isMobileView?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvas = useRef<Canvas | null>(null);
  const isLoadingRef = useRef(false);
  const historyRef = useRef<Map<string, HistoryStacks>>(new Map());
  /** Earliest undo target per canvas: state right after photo upload (no black pre-upload). */
  const historyFloorRef = useRef<Map<string, string>>(new Map());
  /** Latest canvas JSON per design/copy key — keeps undo stacks isolated per design. */
  const lastSavedJsonByKeyRef = useRef<Map<string, string>>(new Map());
  /** Bumps on each design switch so stale loadFromJSON callbacks cannot overwrite store. */
  const canvasLoadGenerationRef = useRef(0);

  const getLastSavedJson = (key: string | null): string | null => {
    if (!key) return null;
    return lastSavedJsonByKeyRef.current.get(key) ?? null;
  };

  const setLastSavedJson = (key: string | null, json: string) => {
    if (!key) return;
    lastSavedJsonByKeyRef.current.set(key, json);
  };

  const getStacks = (id: string): HistoryStacks => {
    let s = historyRef.current.get(id);
    if (!s) {
      s = { undo: [], redo: [] };
      historyRef.current.set(id, s);
    }
    return s;
  };

  const pruneHistoryStacks = (key: string) => {
    const stacks = getStacks(key);
    stacks.undo = stacks.undo.filter((entry) => canvasJsonHasUserPhoto(entry));
    stacks.redo = stacks.redo.filter((entry) => canvasJsonHasUserPhoto(entry));
  };

  /** Undo cannot go earlier than this snapshot (first state with a user photo). */
  const setHistoryFloor = (key: string, json: string) => {
    if (!canvasJsonHasUserPhoto(json)) return;
    historyFloorRef.current.set(key, json);
    pruneHistoryStacks(key);
  };

  const {
    activeSleeveId,
    activeSleeveCopyId,
    updateSleeve,
    updateSleeveCopy,
    sleeves,
    packs,
    setActiveObjectType,
    setTextProps,
    setActiveTab,
    setPhotoAdjustments,
  } = useStore();

  const activeSleeve = sleeves.find(s => s.id === activeSleeveId);
  const activePack = activeSleeve
    ? packs.find((p) => p.id === activeSleeve.packId)
    : undefined;
  const isJapanese = activePack?.sleeveType === 'Japanese';
  const currentHeight = isJapanese ? 575 : 560;

  const latestSleeveIdRef = useRef(activeSleeveId);
  const latestSleeveCopyIdRef = useRef(activeSleeveCopyId);
  const latestCanvasKeyRef = useRef(activeSleeveId ? `${activeSleeveId}:${activeSleeveCopyId ?? 'design'}` : null);
  const currentHeightRef = useRef(currentHeight);

  // Keep these refs in sync before browser events can dispatch canvas actions.
  useLayoutEffect(() => {
    latestSleeveIdRef.current = activeSleeveId;
    latestSleeveCopyIdRef.current = activeSleeveCopyId;
    latestCanvasKeyRef.current = activeSleeveId ? `${activeSleeveId}:${activeSleeveCopyId ?? 'design'}` : null;
    currentHeightRef.current = currentHeight;
  }, [activeSleeveId, activeSleeveCopyId, currentHeight]);

  const highResFlushInFlightRef = useRef(new Set<string>());

  useLayoutEffect(() => {
    return () => {
      const canvas = fabricCanvas.current;
      const designId = latestSleeveIdRef.current;
      const copyId = latestSleeveCopyIdRef.current;
      if (!canvas || !designId) return;

      const matchesViewport = isMobileView === window.matchMedia('(max-width: 1023px)').matches;
      if (!matchesViewport) {
        console.log(`CLEANUP IGNORED for viewport isMobileView=${isMobileView} design=${designId}`);
        return;
      }

      const designSnap = useStore.getState().sleeves.find((s) => s.id === designId);
      const copySnap = copyId
        ? designSnap?.sleeveCopies?.find((c) => c.id === copyId)
        : undefined;
      const existingCanvas = copySnap?.canvasData ?? designSnap?.canvasData;
      const existingPreview = copySnap?.previewUrl ?? designSnap?.previewUrl;

      let json: string;
      let previewUrl: string;

      console.log('CLEANUP RUNNING for design:', designId, 'isLoading:', isLoadingRef.current);
      if (isLoadingRef.current) {
        const cachedJson = lastSavedJsonByKeyRef.current.get(
          `${designId}:${copyId ?? 'design'}`
        );
        console.log('isLoading is true. cachedJson length:', cachedJson?.length, 'existingCanvas length:', existingCanvas?.length);
        if (cachedJson && canvasHasUserPhoto(cachedJson)) {
          json = cachedJson;
          previewUrl = existingPreview ?? canvas.toDataURL({ format: 'jpeg', quality: 0.8, multiplier: 1 });
        } else if (existingCanvas && canvasHasUserPhoto(existingCanvas) && existingPreview) {
          json = existingCanvas;
          previewUrl = existingPreview;
        } else {
          console.log('isLoading is true, but no cache/existing with photo. Returning early.');
          return;
        }
      } else {
        json = JSON.stringify(canvas.toObject([...CANVAS_JSON_PROPS]));
        console.log('isLoading is false. json length:', json.length, 'existingCanvas length:', existingCanvas?.length);
        previewUrl = canvas.toDataURL({ format: 'jpeg', quality: 0.8, multiplier: 1 });
        if (
          !canvasJsonHasUserPhoto(json) &&
          canvasHasUserPhoto(existingCanvas) &&
          existingPreview
        ) {
          console.log('isLoading is false, but new json lacks photo while existing has it. Returning early to prevent loss.');
          return;
        }
      }

      if (copyId) {
        useStore.getState().updateSleeveCopy(designId, copyId, { canvasData: json, previewUrl });
      } else {
        useStore.getState().updateSleeve(designId, { canvasData: json, previewUrl });
      }

      // Skip uploading if canvas is completely empty (no custom elements)
      try {
        const data = JSON.parse(json);
        if (!data.objects || data.objects.length === 0) return;
      } catch {
        return;
      }

      if (highResFlushInFlightRef.current.has(designId)) return;

      const state = useStore.getState();
      const design = state.sleeves.find((s) => s.id === designId);
      const pack = design ? state.packs.find((p) => p.id === design.packId) : undefined;
      const purchaseId = state.purchaseId;
      if (!design || !pack || !purchaseId) return;

      highResFlushInFlightRef.current.add(designId);
      console.log(`[S3 Flush] Uploading design ${designId} (switching away or leaving editor)…`);

      void flushDesignToS3({
        purchaseId,
        designId,
        copyId,
        canvasData: json,
        sleeveType: pack.sleeveType,
        ...(design.imageAdjustments !== undefined
          ? { imageAdjustments: design.imageAdjustments }
          : {}),
      }).finally(() => {
        highResFlushInFlightRef.current.delete(designId);
      });
    };
  }, [activeSleeveId, activeSleeveCopyId]);

  // 1. Initialize Canvas once
  useEffect(() => {
    if (!canvasRef.current || fabricCanvas.current) return;

    const canvas = new Canvas(canvasRef.current, {
      width: CANVAS_WIDTH,
      height: currentHeight,
      backgroundColor: '#000000',
    });

    fabricCanvas.current = canvas;

    const updateActiveObjectState = () => {
      const active = canvas.getActiveObject();
      if (!active) {
        setActiveObjectType(null);
        return;
      }
      if ((active as any).isFrame) {
        setActiveObjectType('frame');
        setTextProps({ fill: (active as any).customColor || '#ffffff' });
        setActiveTab('Frames');
        return;
      }
      if (active.type === 'i-text') {
        setActiveObjectType('i-text');
        const textObj = active as IText;
        setActiveTab('Text');
        setTextProps({
          fontFamily: textObj.fontFamily,
          fontSize: textObj.fontSize || 32,
          fill: textObj.fill as string,
          stroke: (textObj.stroke as string) || '#000000',
          strokeWidth: typeof textObj.strokeWidth === 'number' ? textObj.strokeWidth : 0,
          backgroundEnabled: Boolean(textObj.backgroundColor),
          backgroundColor: (textObj.backgroundColor as string) || '#000000',
          fontWeight: textObj.fontWeight,
          fontStyle: textObj.fontStyle,
          underline: textObj.underline || false,
          textAlign: textObj.textAlign || 'center',
        });
        return;
      }
      if (isUserLayerImage(active)) {
        setActiveObjectType('image');
        // Stay on Adjustments while tuning sliders (mobile); otherwise open Photos tools.
        if (useStore.getState().activeTab !== 'Adjustments') {
          setActiveTab('Photos');
        }
        const sid = latestSleeveIdRef.current;
        const design = sid ? useStore.getState().sleeves.find((s) => s.id === sid) : undefined;
        if (design?.imageAdjustments !== undefined) {
          setPhotoAdjustments(
            mergeImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS, design.imageAdjustments)
          );
        } else {
          const raw = (active as FabricImage & { imageAdjustments?: Partial<ImageAdjustments> })
            .imageAdjustments;
          setPhotoAdjustments(mergeImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS, raw ?? {}));
        }
        return;
      }
      setActiveObjectType(active.type);
    };

    canvas.on('selection:created', updateActiveObjectState);
    canvas.on('selection:updated', updateActiveObjectState);
    canvas.on('selection:cleared', () => setActiveObjectType(null));

    canvas.on('object:moving', (e) => {
      const obj = e.target;
      if (!obj || (obj as any).isFrame) return;

      const objWidth = obj.getScaledWidth();
      const objHeight = obj.getScaledHeight();
      const cvsHeight = currentHeightRef.current;

      if (obj.originX === 'center' && obj.originY === 'center') {
        let minX, maxX, minY, maxY;

        if (objWidth > CANVAS_WIDTH) {
          minX = CANVAS_WIDTH - objWidth / 2;
          maxX = objWidth / 2;
        } else {
          minX = objWidth / 2;
          maxX = CANVAS_WIDTH - objWidth / 2;
        }

        if (objHeight > cvsHeight) {
          minY = cvsHeight - objHeight / 2;
          maxY = objHeight / 2;
        } else {
          minY = objHeight / 2;
          maxY = cvsHeight - objHeight / 2;
        }

        obj.set({
          left: Math.max(minX, Math.min(obj.left as number, maxX)),
          top: Math.max(minY, Math.min(obj.top as number, maxY))
        });
      }
    });

    const saveToStore = () => {
      const currentId = latestSleeveIdRef.current;
      if (!fabricCanvas.current || !currentId || isLoadingRef.current) return;
      const json = JSON.stringify(fabricCanvas.current.toObject([...CANVAS_JSON_PROPS]));
      const dataUrl = fabricCanvas.current.toDataURL({ format: 'jpeg', quality: 0.8, multiplier: 1 });
      const currentCopyId = latestSleeveCopyIdRef.current;
      setLastSavedJson(latestCanvasKeyRef.current, json);
      if (currentCopyId) {
        updateSleeveCopy(currentId, currentCopyId, { canvasData: json, previewUrl: dataUrl });
      } else {
        updateSleeve(currentId, { canvasData: json, previewUrl: dataUrl });
      }
    };

    const snapshotHistory = () => {
      const key = latestCanvasKeyRef.current;
      if (!fabricCanvas.current || isLoadingRef.current || !key) return;
      const json = JSON.stringify(fabricCanvas.current.toObject([...CANVAS_JSON_PROPS]));
      const prev = getLastSavedJson(key);
      if (prev === json) return;

      const stacks = getStacks(key);
      const floor = historyFloorRef.current.get(key);
      if (prev && canvasJsonHasUserPhoto(prev)) {
        stacks.undo.push(prev);
        if (stacks.undo.length > HISTORY_LIMIT) {
          stacks.undo.shift();
        }
      }

      stacks.redo = [];
      setLastSavedJson(key, json);
      if (canvasJsonHasUserPhoto(json) && !floor) {
        setHistoryFloor(key, json);
      }
    };

    const restoreFromJson = async (json: string) => {
      const cvs = fabricCanvas.current;
      if (!cvs) return;
      isLoadingRef.current = true;
      try {
        await cvs.loadFromJSON(JSON.parse(json));
        if (fabricCanvas.current !== cvs) return;
        restoreLockedProperties(cvs);
        reapplyLoadedImageFilters(cvs);
        cvs.renderAll();
        const restoreKey = latestCanvasKeyRef.current;
        if (restoreKey) setLastSavedJson(restoreKey, json);
        // Let Fabric settle, then re-enable persistence
        setTimeout(() => {
          isLoadingRef.current = false;
          const sid = latestSleeveIdRef.current;
          if (sid && fabricCanvas.current === cvs) {
            const img = getTargetUserImage(cvs);
            if (img) {
              const raw = (img as FabricImage & { imageAdjustments?: Partial<ImageAdjustments> })
                .imageAdjustments;
              const adj = mergeImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS, raw ?? {});
              useStore.getState().updateSleeve(sid, { imageAdjustments: adj });
            }
          }
          saveToStore();
        }, 30);
      } catch {
        isLoadingRef.current = false;
      }
    };

    canvas.on('object:modified', (e) => {
      if (isLoadingRef.current) return;

      const obj = e.target;
      if (obj && obj.type === 'i-text') {
        const textObj = obj as IText;
        if (textObj.scaleX && textObj.scaleX !== 1) {
          textObj.set({
            fontSize: Math.round((textObj.fontSize || 32) * textObj.scaleX),
            scaleX: 1,
            scaleY: 1
          });
        }
      }

      updateActiveObjectState();
      snapshotHistory();
      saveToStore();
    });

    canvas.on('object:added', (e) => {
      if (isLoadingRef.current) return;
      // Keep text above images
      canvas.getObjects().forEach(obj => {
        if (obj.type === 'i-text' && e.target !== obj) {
          canvas.bringObjectToFront(obj);
        }
      });
      // Keep frames on the very top
      const frame = canvas.getObjects().find((obj: any) => obj.isFrame);
      if (frame && e.target !== frame) {
        canvas.bringObjectToFront(frame);
      }
      snapshotHistory();
      saveToStore();
    });

    canvas.on('object:removed', () => {
      if (isLoadingRef.current) return;
      snapshotHistory();
      saveToStore();
    });

    // Event Listener for external actions
    const handleCanvasAction = (e: Event) => {
      // Ignore actions if this canvas instance's viewport target doesn't match the current screen size
      const matchesViewport = isMobileView === window.matchMedia('(max-width: 1023px)').matches;
      if (!matchesViewport) return;

      const action = (e as CustomEvent<CanvasAction>).detail;
      const cvs = fabricCanvas.current;
      if (!cvs) return;

      switch (action.type) {
        case 'UPLOAD_IMAGE': {
          const { packs, sessionImageUploadCount, sleeves } = useStore.getState();
          const cap = totalOrderSleeves(packs);
          if (packs.length === 0) {
            void appAlert({
              title: 'Add a pack first',
              message:
                'Choose a size on the right, then tap Start designing — then you can upload photos.',
            });
            break;
          }
          const sid = latestSleeveIdRef.current;
          const design = sid ? sleeves.find((s) => s.id === sid) : undefined;
          const existingOnCanvas = getTargetUserImage(cvs);
          const isReplace =
            Boolean(existingOnCanvas) || designHasUserPhoto(design);
          if (!isReplace && shouldBlockNextImageUpload(packs, sessionImageUploadCount)) {
            void appAlert({
              title: 'Upload limit reached',
              message: `You can upload at most ${cap} images in this session (one per sleeve across all your packs).`,
            });
            break;
          }
          const file = action.payload;
          isLoadingRef.current = true; // Synchronously block intermediate saves/cleanups
          void (async () => {
            const validation = await validateUploadedImage(file);
            if (!validation.ok) {
              isLoadingRef.current = false;
              await appAlert({
                title: 'Invalid image',
                message: validation.error.message,
                variant: 'destructive',
              });
              return;
            }
            const reader = new FileReader();
            reader.onload = (f) => {
              const data = f.target?.result as string;
              FabricImage.fromURL(data).then((img) => {
                if (fabricCanvas.current !== cvs || latestSleeveIdRef.current !== sid) {
                  isLoadingRef.current = false;
                  return;
                }
                const cvsHeight = currentHeightRef.current;

                if (isReplace) {
                  removeUserLayerImages(cvs);
                }

                applyCoverLayout(img, cvsHeight);

                let adj: ImageAdjustments;
                if (design?.imageAdjustments !== undefined) {
                  adj = mergeImageAdjustments(
                    DEFAULT_IMAGE_ADJUSTMENTS,
                    design.imageAdjustments
                  );
                } else if (isReplace && existingOnCanvas) {
                  adj = mergeImageAdjustments(
                    DEFAULT_IMAGE_ADJUSTMENTS,
                    (existingOnCanvas as FabricImage & { imageAdjustments?: Partial<ImageAdjustments> })
                      .imageAdjustments ?? {}
                  );
                } else {
                  adj = { ...DEFAULT_IMAGE_ADJUSTMENTS };
                }

                applyUserImageAdjustments(img, adj);
                cvs.add(img);
                cvs.setActiveObject(img);
                cvs.renderAll();
                updateActiveObjectState();
                setPhotoAdjustments(adj);
                if (sid && !design?.imageAdjustments) {
                  useStore.getState().updateSleeve(sid, { imageAdjustments: { ...adj } });
                }
                if (!isReplace) {
                  useStore.getState().incrementSessionImageUpload();
                }
                const key = latestCanvasKeyRef.current;
                const json = JSON.stringify(cvs.toObject([...CANVAS_JSON_PROPS]));
                isLoadingRef.current = false; // Safely unlock before snapshot/save
                snapshotHistory();
                if (key) setHistoryFloor(key, json);
                saveToStore();
              }).catch(() => {
                isLoadingRef.current = false;
              });
            };
            reader.onerror = () => {
              isLoadingRef.current = false;
            };
            reader.readAsDataURL(file);
          })();
          break;
        }
        case 'ADD_TEXT': {
          const cvsHeight = currentHeightRef.current;
          const text = new IText('Double click to edit', {
            left: CANVAS_WIDTH / 2,
            top: cvsHeight / 2,
            fontFamily: 'Inter',
            fontSize: 32,
            fill: '#ffffff',
            stroke: '#000000',
            strokeWidth: 4,
            paintFirst: 'stroke',
            originX: 'center',
            originY: 'center',
          });
          cvs.add(text);
          cvs.setActiveObject(text);
          cvs.renderAll();
          saveToStore();
          break;
        }
        case 'APPLY_FRAME': {
          const type = action.payload;
          const cvsHeight = currentHeightRef.current;
          const sid = latestSleeveIdRef.current;
          const existing = cvs.getObjects().filter((obj: any) => obj.isFrame);
          existing.forEach(obj => cvs.remove(obj));

          if (type !== 'none') {
            const frameSrc = {
              'standard': '/frames/01.svg?v=8',
              'fade': '/frames/02.svg?v=8',
              'torn1': '/frames/03.svg?v=8',
              'torn2': '/frames/04.svg?v=8',
              'wobble': '/frames/05.svg?v=8',
              'floral': '/frames/06.svg?v=8',
              'scallop': '/frames/07.svg?v=8',
              'stamp': '/frames/08.svg?v=8',
              'wavy': '/frames/09.svg?v=8',
              'zigzag': '/frames/10.svg?v=8',
            }[type as string];

            if (frameSrc) {
              FabricImage.fromURL(frameSrc).then((img) => {
                if (fabricCanvas.current !== cvs || latestSleeveIdRef.current !== sid) return;
                const scaleX = CANVAS_WIDTH / 400;
                const scaleY = cvsHeight / 560;

                img.set({
                  left: CANVAS_WIDTH / 2,
                  top: cvsHeight / 2,
                  originX: 'center',
                  originY: 'center',
                  scaleX: scaleX,
                  scaleY: scaleY,
                  selectable: true,
                  evented: true,
                  lockMovementX: true,
                  lockMovementY: true,
                  lockScalingX: true,
                  lockScalingY: true,
                  lockRotation: true,
                  hasControls: false,
                  hasBorders: true,
                  perPixelTargetFind: true,
                  hoverCursor: 'default',
                });
                (img as any).isFrame = true;
                (img as any).customColor = '#ffffff';
                cvs.add(img);
                cvs.bringObjectToFront(img);
                cvs.renderAll();
                saveToStore();
              });
              return;
            }
          }
          cvs.renderAll();
          saveToStore();
          break;
        }
        case 'APPLY_IMAGE_FILTER': {
          const img = getTargetUserImage(cvs);
          if (!img) break;

          let adj: ImageAdjustments;
          if (action.payload === 'standard') {
            adj = { ...DEFAULT_IMAGE_ADJUSTMENTS };
          } else if (action.payload === 'bw') {
            adj = { ...DEFAULT_IMAGE_ADJUSTMENTS, mode: 'bw' };
          } else {
            adj = { ...DEFAULT_IMAGE_ADJUSTMENTS, mode: 'enhance' };
          }
          (img as FabricImage & { imageAdjustments: ImageAdjustments }).imageAdjustments = adj;
          img.filters = buildImageFilters(adj);
          try {
            img.applyFilters();
          } catch {
            // ignore
          }
          cvs.setActiveObject(img);
          cvs.renderAll();
          setPhotoAdjustments(adj);
          const sid = latestSleeveIdRef.current;
          if (sid) useStore.getState().updateSleeve(sid, { imageAdjustments: { ...adj } });
          updateActiveObjectState();
          snapshotHistory();
          saveToStore();
          break;
        }
        case 'SET_IMAGE_ADJUSTMENTS': {
          const img = getTargetUserImage(cvs);
          if (!img) break;
          const sid = latestSleeveIdRef.current;
          const designForAdj = sid ? useStore.getState().sleeves.find((s) => s.id === sid) : undefined;
          const prevFromDesign =
            designForAdj?.imageAdjustments !== undefined
              ? mergeImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS, designForAdj.imageAdjustments)
              : undefined;
          const prevOnImg = (img as FabricImage & { imageAdjustments?: ImageAdjustments }).imageAdjustments;
          const next = mergeImageAdjustments(prevFromDesign ?? prevOnImg ?? DEFAULT_IMAGE_ADJUSTMENTS, {
            ...action.payload,
            mode: 'manual',
          });
          (img as FabricImage & { imageAdjustments: ImageAdjustments }).imageAdjustments = next;
          img.filters = buildImageFilters(next);
          try {
            img.applyFilters();
          } catch {
            /* noop */
          }
          cvs.setActiveObject(img);
          cvs.renderAll();
          setPhotoAdjustments(next);
          if (sid) useStore.getState().updateSleeve(sid, { imageAdjustments: { ...next } });
          updateActiveObjectState();
          snapshotHistory();
          saveToStore();
          break;
        }
        case 'RESET_IMAGE_ADJUSTMENTS': {
          const img = getTargetUserImage(cvs);
          if (!img) break;
          const next = { ...DEFAULT_IMAGE_ADJUSTMENTS };
          (img as FabricImage & { imageAdjustments: ImageAdjustments }).imageAdjustments = next;
          img.filters = buildImageFilters(next);
          try {
            img.applyFilters();
          } catch {
            /* noop */
          }
          cvs.setActiveObject(img);
          cvs.renderAll();
          setPhotoAdjustments(next);
          const sidReset = latestSleeveIdRef.current;
          if (sidReset) useStore.getState().updateSleeve(sidReset, { imageAdjustments: { ...next } });
          updateActiveObjectState();
          snapshotHistory();
          saveToStore();
          break;
        }
        case 'TOGGLE_FORMAT': {
          const obj = cvs.getActiveObject() as IText;
          if (!obj || obj.type !== 'i-text') break;
          const format = action.payload;
          if (format === 'bold') {
            obj.set('fontWeight', obj.fontWeight === 'bold' ? 'normal' : 'bold');
          } else if (format === 'italic') {
            obj.set('fontStyle', obj.fontStyle === 'italic' ? 'normal' : 'italic');
          } else if (format === 'underline') {
            obj.set('underline', !obj.underline);
          }
          cvs.renderAll();
          updateActiveObjectState();
          saveToStore();
          break;
        }
        case 'SET_TEXT_ALIGN': {
          const obj = cvs.getActiveObject() as IText;
          if (!obj || obj.type !== 'i-text') break;
          obj.set('textAlign', action.payload);
          cvs.renderAll();
          updateActiveObjectState();
          saveToStore();
          break;
        }
        case 'CHANGE_FONT_SIZE': {
          const obj = cvs.getActiveObject() as IText;
          if (!obj || obj.type !== 'i-text') break;
          const current = obj.fontSize || 32;
          const next = Math.max(8, current + action.payload);
          obj.set('fontSize', next);
          cvs.renderAll();
          updateActiveObjectState();
          saveToStore();
          break;
        }
        case 'CHANGE_FONT_FAMILY': {
          const obj = cvs.getActiveObject() as IText;
          if (!obj || obj.type !== 'i-text') break;
          obj.set('fontFamily', action.payload);
          cvs.renderAll();
          updateActiveObjectState();
          saveToStore();
          break;
        }
        case 'CHANGE_COLOR': {
          const obj = cvs.getActiveObject() as IText;
          if (!obj || obj.type !== 'i-text') break;
          obj.set('fill', action.payload);
          cvs.renderAll();
          updateActiveObjectState();
          saveToStore();
          break;
        }
        case 'CHANGE_TEXT_STROKE_COLOR': {
          const obj = cvs.getActiveObject() as IText;
          if (!obj || obj.type !== 'i-text') break;
          obj.set({
            stroke: action.payload,
            paintFirst: 'stroke',
          });
          cvs.renderAll();
          updateActiveObjectState();
          saveToStore();
          break;
        }
        case 'CHANGE_TEXT_STROKE_WIDTH': {
          const obj = cvs.getActiveObject() as IText;
          if (!obj || obj.type !== 'i-text') break;
          const next = Math.max(0, action.payload);
          obj.set({
            strokeWidth: next,
            paintFirst: 'stroke',
          });
          cvs.renderAll();
          updateActiveObjectState();
          saveToStore();
          break;
        }
        case 'TOGGLE_TEXT_BACKGROUND': {
          const obj = cvs.getActiveObject() as IText;
          if (!obj || obj.type !== 'i-text') break;
          const currentlyOn = Boolean(obj.backgroundColor);
          obj.set('backgroundColor', currentlyOn ? '' : '#000000');
          cvs.renderAll();
          updateActiveObjectState();
          saveToStore();
          break;
        }
        case 'CHANGE_TEXT_BACKGROUND_COLOR': {
          const obj = cvs.getActiveObject() as IText;
          if (!obj || obj.type !== 'i-text') break;
          obj.set('backgroundColor', action.payload);
          cvs.renderAll();
          updateActiveObjectState();
          saveToStore();
          break;
        }
        case 'DELETE_ACTIVE_TEXT': {
          const obj = cvs.getActiveObject();
          if (!obj || obj.type !== 'i-text') break;
          cvs.remove(obj);
          cvs.discardActiveObject();
          cvs.renderAll();
          setActiveObjectType(null);
          saveToStore();
          break;
        }
        case 'DISCARD_CANVAS_SELECTION': {
          cvs.discardActiveObject();
          cvs.renderAll();
          setActiveObjectType(null);
          saveToStore();
          break;
        }
        case 'UNDO': {
          const key = latestCanvasKeyRef.current;
          if (!key) break;
          const stacks = getStacks(key);
          const floor = historyFloorRef.current.get(key);
          const current =
            getLastSavedJson(key) || JSON.stringify(cvs.toObject([...CANVAS_JSON_PROPS]));
          if (floor && current === floor) break;

          while (stacks.undo.length > 0) {
            const peek = stacks.undo[stacks.undo.length - 1];
            if (!canvasJsonHasUserPhoto(peek)) {
              stacks.undo.pop();
              continue;
            }
            const prev = stacks.undo.pop()!;
            stacks.redo.push(current);
            setLastSavedJson(key, prev);
            void restoreFromJson(prev);
            break;
          }
          break;
        }
        case 'REDO': {
          const key = latestCanvasKeyRef.current;
          if (!key) break;
          const stacks = getStacks(key);
          const current =
            getLastSavedJson(key) || JSON.stringify(cvs.toObject([...CANVAS_JSON_PROPS]));

          while (stacks.redo.length > 0) {
            const peek = stacks.redo[stacks.redo.length - 1];
            if (!canvasJsonHasUserPhoto(peek)) {
              stacks.redo.pop();
              continue;
            }
            const next = stacks.redo.pop()!;
            stacks.undo.push(current);
            setLastSavedJson(key, next);
            void restoreFromJson(next);
            break;
          }
          break;
        }
        case 'CHANGE_FRAME_COLOR': {
          const frame = cvs.getObjects().find((o: any) => o.isFrame) as FabricImage;
          if (!frame) break;

          (frame as any).customColor = action.payload;

          if (action.payload === '#ffffff') {
            frame.filters = [];
          } else {
            const filter = new filters.BlendColor({
              color: action.payload,
              mode: 'multiply',
              alpha: 1
            });
            frame.filters = [filter];
          }
          frame.applyFilters();
          cvs.renderAll();
          updateActiveObjectState();
          saveToStore();
          break;
        }
        case 'FORCE_SAVE': {
          if (!isLoadingRef.current) {
            snapshotHistory();
            saveToStore();
          }
          break;
        }
      }
    };

    window.addEventListener('CANVAS_ACTION', handleCanvasAction);

    // Keyboard support for deleting objects
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keyboard shortcuts if the user is focused on an input, textarea, or contenteditable DOM element
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
         target.tagName === 'TEXTAREA' ||
         target.isContentEditable)
      ) {
        return;
      }

      const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          dispatchCanvasAction({ type: 'REDO' });
        } else {
          dispatchCanvasAction({ type: 'UNDO' });
        }
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        const activeObj = canvas.getActiveObject();
        // Only delete if we are not actively typing in an input or textarea
        if (activeObj) {
          const isTextEditing = activeObj.type === 'i-text' && (activeObj as IText).isEditing;
          if (!isTextEditing) {
            canvas.remove(activeObj);
            saveToStore();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('CANVAS_ACTION', handleCanvasAction);
      window.removeEventListener('keydown', handleKeyDown);
      try {
        // Prevent lingering async callbacks (like loadFromJSON) from crashing after unmount
        if (canvas) {
          canvas.clearContext = () => canvas;
          canvas.clear = () => canvas;
          canvas.renderAll = () => canvas;
          canvas.requestRenderAll = () => canvas;
          canvas.dispose();
        }
      } catch (e) {
        // Ignore dispose errors on unmount
      }
      fabricCanvas.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1.5 Sync dimensions when type changes
  useEffect(() => {
    if (fabricCanvas.current) {
      const cvs = fabricCanvas.current;
      const oldHeight = cvs.height;
      const newHeight = currentHeight;

      if (oldHeight !== newHeight) {
        const scaleFactor = newHeight / oldHeight;

        cvs.setDimensions({
          width: CANVAS_WIDTH,
          height: newHeight
        });

        // Adjust existing objects to fit new height
        cvs.getObjects().forEach(obj => {
          // 1. Maintain relative position (multiplier) instead of forcing center
          if (obj.top !== undefined) {
            obj.set('top', obj.top * scaleFactor);
          }

          // 2. For frames: Force absolute scale to match the new height
          if ((obj as any).isFrame) {
            obj.set({
              scaleX: CANVAS_WIDTH / 400,
              scaleY: newHeight / 560
            });
          }
          // 3. For images: Scale uniformly to maintain aspect ratio
          else if (isUserLayerImage(obj)) {
            // Uploaded images should always "cover" the black sleeve area after resize.
            // Use a stable base measurement at scale=1, then compute cover scale.
            obj.set({ scaleX: 1, scaleY: 1 });
            const baseW = obj.getScaledWidth() || CANVAS_WIDTH;
            const baseH = obj.getScaledHeight() || newHeight;
            const coverScale = Math.max(CANVAS_WIDTH / baseW, newHeight / baseH);

            obj.set({
              originX: 'center',
              originY: 'center',
              left: CANVAS_WIDTH / 2,
              top: newHeight / 2,
              scaleX: coverScale,
              scaleY: coverScale
            });
          }
          // 4. For text: Scale font size instead of object scale to keep it editable
          else if (obj.type === 'i-text') {
            const currentFontSize = (obj as IText).fontSize || 32;
            (obj as IText).set({
              fontSize: currentFontSize * scaleFactor
            });
          }

          // Update selection coordinates after moving/scaling
          obj.setCoords();
        });

        cvs.renderAll();
      }
    }
  }, [currentHeight]);

  // 2. Sync Canvas when the active design or individual sleeve copy changes
  useEffect(() => {
    const matchesViewport = isMobileView === window.matchMedia('(max-width: 1023px)').matches;
    if (!matchesViewport) return;

    if (!fabricCanvas.current || !activeSleeveId) return;
    const canvas = fabricCanvas.current;
    const loadGeneration = ++canvasLoadGenerationRef.current;
    const loadTargetSleeveId = activeSleeveId;
    const loadTargetCopyId = activeSleeveCopyId;

    isLoadingRef.current = true;
    const activeSleeve = sleeves.find(s => s.id === activeSleeveId);
    const activeCopy = activeSleeve?.sleeveCopies?.find((copy) => copy.id === activeSleeveCopyId);
    const canvasData = activeSleeve ? sleeveCopyCanvasData(activeSleeve, activeCopy) : undefined;

    const currentIds = new Set(
      useStore.getState().sleeves.flatMap((s) => [
        `${s.id}:design`,
        ...sleeveCopiesForDesign(s).map((copy) => `${s.id}:${copy.id}`),
      ])
    );
    for (const id of [...historyRef.current.keys()]) {
      if (!currentIds.has(id)) {
        historyRef.current.delete(id);
        historyFloorRef.current.delete(id);
        lastSavedJsonByKeyRef.current.delete(id);
      }
    }

    const canvasKey = activeSleeveId
      ? `${activeSleeveId}:${activeSleeveCopyId ?? 'design'}`
      : null;

    // Sync the sidebar adjustment sliders to the newly active design's saved values.
    // This ensures each design has independent adjustments instead of sharing global state.
    const snapForAdj = useStore.getState().sleeves.find((s) => s.id === activeSleeveId);
    if (snapForAdj?.imageAdjustments !== undefined) {
      setPhotoAdjustments(mergeImageAdjustments(DEFAULT_IMAGE_ADJUSTMENTS, snapForAdj.imageAdjustments));
    } else {
      setPhotoAdjustments({ ...DEFAULT_IMAGE_ADJUSTMENTS });
    }

    if (canvasData) {
      canvas.loadFromJSON(JSON.parse(canvasData)).then(() => {
        if (canvasLoadGenerationRef.current !== loadGeneration) return;
        if (fabricCanvas.current !== canvas) return;
        if (latestSleeveIdRef.current !== loadTargetSleeveId) return;
        if (latestSleeveCopyIdRef.current !== loadTargetCopyId) return;

        const designSnap = useStore
          .getState()
          .sleeves.find((s) => s.id === loadTargetSleeveId);
        restoreLockedProperties(canvas);
        applyDesignPhotoFiltersToCanvas(canvas, designSnap);
        canvas.renderAll();

        const json = JSON.stringify(canvas.toObject([...CANVAS_JSON_PROPS]));
        const existingCanvas = canvasData;
        if (
          !canvasJsonHasUserPhoto(json) &&
          canvasHasUserPhoto(existingCanvas)
        ) {
          setTimeout(() => {
            if (canvasLoadGenerationRef.current === loadGeneration) {
              isLoadingRef.current = false;
            }
          }, 50);
          return;
        }

        const dataUrl = canvas.toDataURL({ format: 'jpeg', quality: 0.8, multiplier: 1 });
        if (loadTargetCopyId) {
          useStore
            .getState()
            .updateSleeveCopy(loadTargetSleeveId, loadTargetCopyId, {
              canvasData: json,
              previewUrl: dataUrl,
            });
        } else {
          useStore.getState().updateSleeve(loadTargetSleeveId, {
            canvasData: json,
            previewUrl: dataUrl,
          });
        }
        if (canvasKey) {
          setLastSavedJson(canvasKey, json);
          if (canvasJsonHasUserPhoto(json) && !historyFloorRef.current.has(canvasKey)) {
            setHistoryFloor(canvasKey, json);
          }
        }
        setTimeout(() => {
          if (canvasLoadGenerationRef.current === loadGeneration) {
            isLoadingRef.current = false;
          }
        }, 50);
      });
    } else {
      if (canvasLoadGenerationRef.current !== loadGeneration) return;
      canvas.remove(...canvas.getObjects());
      canvas.discardActiveObject();
      canvas.backgroundColor = '#000000';
      canvas.renderAll();
      setActiveObjectType(null);
      const emptyJson = JSON.stringify(canvas.toObject([...CANVAS_JSON_PROPS]));
      if (canvasKey) {
        setLastSavedJson(canvasKey, emptyJson);
        historyFloorRef.current.delete(canvasKey);
      }
      setTimeout(() => {
        if (canvasLoadGenerationRef.current === loadGeneration) {
          isLoadingRef.current = false;
        }
      }, 50);
    }
  }, [activeSleeveId, activeSleeveCopyId, setActiveObjectType, setPhotoAdjustments]); // We omit sleeves from deps to prevent infinite loops

  // Active design artwork only — qty/copy count changes must not retrigger S3 upload.
  const activeDesignArtwork = useMemo(() => {
    if (!activeSleeveId) return null;
    const design = sleeves.find((s) => s.id === activeSleeveId);
    if (!design) return null;
    const copy = design.sleeveCopies?.find((c) => c.id === activeSleeveCopyId);
    const canvasData = copy?.canvasData ?? design.canvasData;
    const previewUrl = copy?.previewUrl ?? design.previewUrl;
    if (!canvasData || !previewUrl) return null;
    return { canvasData, previewUrl };
  }, [activeSleeveId, activeSleeveCopyId, sleeves]);

  // Debounced preview + JSON auto-save AND HD pre-upload while editing.
  const lastUploadedJsonByDesignRef = useRef<Map<string, string>>(new Map());
  // Per-design in-flight tracking: key = "designId:copyId", value = true while uploading.
  // A single boolean would cause design B's auto-save to be skipped while design A uploads.
  const s3UploadInFlightByDesignRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const matchesViewport = isMobileView === window.matchMedia('(max-width: 1023px)').matches;
    if (!matchesViewport) return;

    if (!activeSleeveId || !activeDesignArtwork) return;
    if (isLoadingRef.current) return;

    const designUploadKey = `${activeSleeveId}:${activeSleeveCopyId ?? 'design'}`;
    const { canvasData } = activeDesignArtwork;

    if (canvasData === lastUploadedJsonByDesignRef.current.get(designUploadKey)) return;

    const purchaseId = useStore.getState().purchaseId;
    if (!purchaseId) return;

    // Capture the active design at the time the effect runs so we can abort if it changes.
    const uploadForSleeveId = activeSleeveId;
    const uploadForCopyId = activeSleeveCopyId;

    const timer = setTimeout(async () => {
      if (isLoadingRef.current) return;
      // Abort if the user switched to a different design while the timer was pending.
      if (
        latestSleeveIdRef.current !== uploadForSleeveId ||
        latestSleeveCopyIdRef.current !== uploadForCopyId
      ) return;
      if (canvasData === lastUploadedJsonByDesignRef.current.get(designUploadKey)) return;
      if (s3UploadInFlightByDesignRef.current.has(designUploadKey)) return;

      // Yield to the browser before the heavy canvas export so the UI can render first.
      // This prevents the 4× toDataURL from blocking a concurrent canvas.loadFromJSON.
      await new Promise<void>((resolve) => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => resolve(), { timeout: 500 });
        } else {
          setTimeout(resolve, 0);
        }
      });

      // Re-check after the yield — the user may have switched designs during idle.
      if (
        latestSleeveIdRef.current !== uploadForSleeveId ||
        latestSleeveCopyIdRef.current !== uploadForCopyId
      ) return;
      if (isLoadingRef.current) return;
      if (s3UploadInFlightByDesignRef.current.has(designUploadKey)) return;

      s3UploadInFlightByDesignRef.current.add(designUploadKey);
      try {
        console.log(`[S3 Auto-Save & HD Upload] Triggering eager background upload for design ${uploadForSleeveId}...`);

        await flushDesignToS3({
          purchaseId,
          designId: uploadForSleeveId,
          copyId: uploadForCopyId,
          canvasData,
          sleeveType: activePack?.sleeveType ?? 'Standard',
          ...(activeSleeve?.imageAdjustments !== undefined
            ? { imageAdjustments: activeSleeve.imageAdjustments }
            : {}),
        });

        console.log(`[S3 Auto-Save & HD Upload] Eager background upload successful for design ${uploadForSleeveId}`);
        lastUploadedJsonByDesignRef.current.set(designUploadKey, canvasData);
      } catch (err) {
        console.warn('[S3 Auto-Save & HD Upload] Error uploading in background:', err);
      } finally {
        s3UploadInFlightByDesignRef.current.delete(designUploadKey);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    activeSleeveId,
    activeSleeveCopyId,
    activeDesignArtwork?.canvasData,
    activePack?.sleeveType,
    activeSleeve?.imageAdjustments,
  ]);

  const FONT_FAMILIES = [
    'Inter',
    'Outfit',
    'Poppins',
    'Montserrat',
    'Roboto',
    'Bebas Neue',
    'Oswald',
    'Playfair Display',
    'Noto Sans',
    'Noto Serif',
  ];

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-start overflow-hidden bg-[#2b2b2b] px-2 pt-5 pb-2 lg:justify-center lg:overflow-auto lg:p-6 lg:pt-5">
      <div className="w-full shrink-0">
        <TextCanvasToolbar />
      </div>

      {/*
        Responsive sizer: scales the (fixed-resolution) Fabric canvas down to
        fit narrow viewports while keeping the backstore (export quality)
        untouched. Fabric maps pointer events through getBoundingClientRect()
        so a CSS transform doesn't break hit testing.
      */}
      <div className="flex w-full min-h-0 flex-1 flex-col items-center justify-center lg:flex-none lg:justify-center lg:pt-8">
        <FluidCanvasFrame width={CANVAS_WIDTH} height={currentHeight}>
          <div className="relative overflow-hidden bg-black shadow-[0_0_50px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
            <canvas ref={canvasRef} style={{ touchAction: 'none' }} />
          </div>
        </FluidCanvasFrame>
      </div>
      <p className="mt-1 shrink-0 text-center text-[8px] uppercase tracking-[0.15em] text-muted-foreground lg:mt-8 lg:text-[10px] lg:tracking-[0.2em]">
        {isJapanese ? 'Japanese (62×89mm)' : 'Standard (5:7)'}
      </p>

      {/* Hidden preloader to force browser to download fonts before Canvas needs them */}
      <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
        {FONT_FAMILIES.map(font => (
          <span key={font} style={{ fontFamily: font }}>preload</span>
        ))}
      </div>
    </div>
  );
}
