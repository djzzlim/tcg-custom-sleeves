'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, type SleeveDesign } from '@/store/useStore';
import { CanvasAction, dispatchCanvasAction } from '@/lib/events';
import {
  buildImageFilters,
  DEFAULT_IMAGE_ADJUSTMENTS,
  mergeImageAdjustments,
  type ImageAdjustments,
} from '@/lib/imageAdjustments';
import { Canvas, IText, FabricImage, Rect, filters } from 'fabric';
import { cn } from '@/lib/utils';
import TextCanvasToolbar from '@/components/Editor/TextCanvasToolbar';
import { Redo2, Undo2 } from 'lucide-react';
import {
  designHasUserPhoto,
  shouldBlockNextImageUpload,
  sleeveCopiesForDesign,
  sleeveCopyCanvasData,
  totalOrderSleeves,
} from '@/lib/packOrder';
import { validateUploadedImage } from '@/lib/imageValidation';
import { appAlert } from '@/lib/appDialog';


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
      // The probe is `width: 100%` inside the column-flex parent, so its
      // clientWidth tracks the maximum width available to the canvas.
      const avail = probe.clientWidth;
      if (avail <= 0) return;
      // Never upscale; leave a tiny breathing room.
      const next = Math.min(1, Math.max(0.1, (avail - 4) / width));
      setScale(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(probe);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, [width]);

  return (
    <div ref={probeRef} className="w-full flex justify-center">
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

function removeUserLayerImages(cvs: Canvas) {
  cvs.getObjects().filter(isUserLayerImage).forEach((obj) => cvs.remove(obj));
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

export default function CanvasEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvas = useRef<Canvas | null>(null);
  const isLoadingRef = useRef(false);
  const historyRef = useRef<Map<string, HistoryStacks>>(new Map());
  const lastSavedJsonRef = useRef<string | null>(null);

  const getStacks = (id: string): HistoryStacks => {
    let s = historyRef.current.get(id);
    if (!s) {
      s = { undo: [], redo: [] };
      historyRef.current.set(id, s);
    }
    return s;
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
        setActiveTab('Photos');
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
      const prev = lastSavedJsonRef.current;
      if (prev === json) return;

      const stacks = getStacks(key);
      if (prev) {
        stacks.undo.push(prev);
        if (stacks.undo.length > HISTORY_LIMIT) {
          stacks.undo.shift();
        }
      }

      stacks.redo = [];
      lastSavedJsonRef.current = json;
    };

    const restoreFromJson = async (json: string) => {
      const cvs = fabricCanvas.current;
      if (!cvs) return;
      isLoadingRef.current = true;
      try {
        await cvs.loadFromJSON(JSON.parse(json));
        if (fabricCanvas.current !== cvs) return;
        reapplyLoadedImageFilters(cvs);
        cvs.renderAll();
        lastSavedJsonRef.current = json;
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
          void (async () => {
            const validation = await validateUploadedImage(file);
            if (!validation.ok) {
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
                if (fabricCanvas.current !== cvs) return;
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
                snapshotHistory();
                saveToStore();
              });
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
                if (fabricCanvas.current !== cvs) return;
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
          const prev = stacks.undo.pop();
          if (!prev) break;
          const current = lastSavedJsonRef.current || JSON.stringify(cvs.toObject([...CANVAS_JSON_PROPS]));
          stacks.redo.push(current);
          void restoreFromJson(prev);
          break;
        }
        case 'REDO': {
          const key = latestCanvasKeyRef.current;
          if (!key) break;
          const stacks = getStacks(key);
          const next = stacks.redo.pop();
          if (!next) break;
          const current = lastSavedJsonRef.current || JSON.stringify(cvs.toObject([...CANVAS_JSON_PROPS]));
          stacks.undo.push(current);
          void restoreFromJson(next);
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
      }
    };

    window.addEventListener('CANVAS_ACTION', handleCanvasAction);

    // Keyboard support for deleting objects
    const handleKeyDown = (e: KeyboardEvent) => {
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
    if (!fabricCanvas.current || !activeSleeveId) return;
    const canvas = fabricCanvas.current;

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
      if (!currentIds.has(id)) historyRef.current.delete(id);
    }

    lastSavedJsonRef.current = null;

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
        if (fabricCanvas.current !== canvas) return;
        const sid = latestSleeveIdRef.current;
        const designSnap = sid ? useStore.getState().sleeves.find((s) => s.id === sid) : undefined;
        applyDesignPhotoFiltersToCanvas(canvas, designSnap);
        canvas.renderAll();

        const json = JSON.stringify(canvas.toObject([...CANVAS_JSON_PROPS]));
        const dataUrl = canvas.toDataURL({ format: 'jpeg', quality: 0.8, multiplier: 1 });
        const currentCopyId = latestSleeveCopyIdRef.current;
        if (sid) {
          if (currentCopyId) {
            useStore.getState().updateSleeveCopy(sid, currentCopyId, { canvasData: json, previewUrl: dataUrl });
          } else {
            useStore.getState().updateSleeve(sid, { canvasData: json, previewUrl: dataUrl });
          }
        }
        lastSavedJsonRef.current = json;
        setTimeout(() => {
          isLoadingRef.current = false;
        }, 50);
      });
    } else {
      canvas.remove(...canvas.getObjects());
      canvas.discardActiveObject();
      canvas.backgroundColor = '#000000';
      canvas.renderAll();
      setActiveObjectType(null);
      const emptyJson = JSON.stringify(canvas.toObject([...CANVAS_JSON_PROPS]));
      lastSavedJsonRef.current = emptyJson;
      setTimeout(() => { isLoadingRef.current = false; }, 50);
    }
  }, [activeSleeveId, activeSleeveCopyId, setActiveObjectType, setPhotoAdjustments]); // We omit sleeves from deps to prevent infinite loops

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
    <div className="flex flex-col items-center justify-start w-full h-full pt-3 px-2 pb-4 sm:pt-12 sm:p-8 overflow-auto bg-[#2b2b2b]">
      <div className="mb-3 sm:mb-6 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => dispatchCanvasAction({ type: 'UNDO' })}
          className="h-10 w-10 rounded-xl border border-white/10 bg-black/30 hover:bg-black/40 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
          title="Undo (Ctrl/Cmd+Z)"
          aria-label="Undo"
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          onClick={() => dispatchCanvasAction({ type: 'REDO' })}
          className="h-10 w-10 rounded-xl border border-white/10 bg-black/30 hover:bg-black/40 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
          title="Redo (Ctrl/Cmd+Shift+Z)"
          aria-label="Redo"
        >
          <Redo2 size={18} />
        </button>
      </div>

      <TextCanvasToolbar />

      {/*
        Responsive sizer: scales the (fixed-resolution) Fabric canvas down to
        fit narrow viewports while keeping the backstore (export quality)
        untouched. Fabric maps pointer events through getBoundingClientRect()
        so a CSS transform doesn't break hit testing.
      */}
      <FluidCanvasFrame width={CANVAS_WIDTH} height={currentHeight}>
        <div className="relative shadow-[0_0_50px_rgba(0,0,0,0.8)] ring-1 ring-white/10 overflow-hidden bg-black">
          <canvas ref={canvasRef} style={{ touchAction: 'none' }} />
        </div>
      </FluidCanvasFrame>
      <p className="mt-4 sm:mt-8 text-[10px] text-muted-foreground uppercase tracking-[0.2em] text-center">
        {isJapanese ? 'Japanese Sleeve (62x89mm)' : 'Standard Sleeve (5:7 Ratio)'}
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
