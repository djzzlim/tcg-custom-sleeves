'use client';

import { useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { CanvasAction } from '@/lib/events';
import { Canvas, IText, FabricImage, Rect, filters } from 'fabric';
import { cn } from '@/lib/utils';


const CANVAS_WIDTH = 400;

export default function CanvasEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvas = useRef<Canvas | null>(null);
  const isLoadingRef = useRef(false);
  const { activeSleeveId, updateSleeve, sleeves, setActiveObjectType, setTextProps, setActiveTab } = useStore();

  const activeSleeve = sleeves.find(s => s.id === activeSleeveId);
  const isJapanese = activeSleeve?.sleeveType === 'Japanese';
  const currentHeight = isJapanese ? 575 : 560;

  const latestSleeveIdRef = useRef(activeSleeveId);
  const currentHeightRef = useRef(currentHeight);

  useEffect(() => {
    latestSleeveIdRef.current = activeSleeveId;
    currentHeightRef.current = currentHeight;
  }, [activeSleeveId, currentHeight]);

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
      setActiveObjectType(active.type);
      if ((active as any).isFrame) {
        setActiveObjectType('frame');
        setTextProps({ fill: (active as any).customColor || '#ffffff' });
        setActiveTab('Frames');
      } else if (active.type === 'i-text') {
        const textObj = active as IText;
        setActiveTab('Text');
        setTextProps({
          fontFamily: textObj.fontFamily,
          fontSize: textObj.fontSize || 32,
          fill: textObj.fill as string,
          fontWeight: textObj.fontWeight,
          fontStyle: textObj.fontStyle,
          underline: textObj.underline || false,
          textAlign: textObj.textAlign || 'center',
        });
      }
    };

    canvas.on('selection:created', updateActiveObjectState);
    canvas.on('selection:updated', updateActiveObjectState);
    canvas.on('selection:cleared', () => setActiveObjectType(null));

    canvas.on('object:moving', (e) => {
      const obj = e.target;
      if (!obj || (obj as any).isFrame) return;

      const objWidth = obj.getScaledWidth();
      const objHeight = obj.getScaledHeight();

      if (obj.originX === 'center' && obj.originY === 'center') {
        let minX, maxX, minY, maxY;

        if (objWidth > CANVAS_WIDTH) {
          minX = CANVAS_WIDTH - objWidth / 2;
          maxX = objWidth / 2;
        } else {
          minX = objWidth / 2;
          maxX = CANVAS_WIDTH - objWidth / 2;
        }

        if (objHeight > currentHeight) {
          minY = currentHeight - objHeight / 2;
          maxY = objHeight / 2;
        } else {
          minY = objHeight / 2;
          maxY = currentHeight - objHeight / 2;
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
      const json = JSON.stringify(fabricCanvas.current.toObject(['isFrame', 'customColor']));
      const dataUrl = fabricCanvas.current.toDataURL({ format: 'jpeg', quality: 0.8, multiplier: 1 });
      updateSleeve(currentId, { canvasData: json, previewUrl: dataUrl });
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
      saveToStore();
    });

    canvas.on('object:removed', () => {
      if (isLoadingRef.current) return;
      saveToStore();
    });

    // Event Listener for external actions
    const handleCanvasAction = (e: Event) => {
      const action = (e as CustomEvent<CanvasAction>).detail;
      const cvs = fabricCanvas.current;
      if (!cvs) return;

      switch (action.type) {
        case 'UPLOAD_IMAGE': {
          const reader = new FileReader();
          reader.onload = (f) => {
            const data = f.target?.result as string;
            FabricImage.fromURL(data).then((img) => {
              if (fabricCanvas.current !== cvs) return;
              const cvsHeight = currentHeightRef.current;
              const scale = Math.max(CANVAS_WIDTH / img.width, cvsHeight / img.height);
              img.set({
                scaleX: scale,
                scaleY: scale,
                left: CANVAS_WIDTH / 2,
                top: cvsHeight / 2,
                originX: 'center',
                originY: 'center',
                hasControls: true,
                lockScalingX: false,
                lockScalingY: false,
              });
              cvs.add(img);
              cvs.renderAll();
              saveToStore();
            });
          };
          reader.readAsDataURL(action.payload);
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
          else if (obj.type === 'image') {
            const currentScaleX = obj.scaleX || 1;
            const currentScaleY = obj.scaleY || 1;
            obj.set({
              scaleX: currentScaleX * scaleFactor,
              scaleY: currentScaleY * scaleFactor
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

  // 2. Sync Canvas when activeSleeveId changes
  useEffect(() => {
    if (!fabricCanvas.current || !activeSleeveId) return;
    const canvas = fabricCanvas.current;

    isLoadingRef.current = true;
    const activeSleeve = sleeves.find(s => s.id === activeSleeveId);

    if (activeSleeve?.canvasData) {
      canvas.loadFromJSON(JSON.parse(activeSleeve.canvasData)).then(() => {
        if (fabricCanvas.current !== canvas) return;
        canvas.renderAll();
        // Allow events to settle before enabling saveToStore
        setTimeout(() => { isLoadingRef.current = false; }, 50);
      });
    } else {
      canvas.remove(...canvas.getObjects());
      canvas.backgroundColor = '#000000';
      canvas.renderAll();
      setTimeout(() => { isLoadingRef.current = false; }, 50);
    }
  }, [activeSleeveId]); // We omit sleeves from deps to prevent infinite loops

  const FONT_FAMILIES = [
    'Inter', 'Outfit'
  ];

  return (
    <div className="flex flex-col items-center justify-start w-full h-full pt-12 p-8 overflow-auto bg-[#2b2b2b]">
      {/* Size Toggle */}
      <div className="mb-6 flex bg-black/40 p-1 rounded-full border border-white/5 shadow-inner">
        <button
          onClick={() => activeSleeveId && updateSleeve(activeSleeveId, { sleeveType: 'Standard' })}
          className={cn(
            "px-6 py-2 rounded-full text-xs font-bold transition-all uppercase tracking-wider",
            !isJapanese ? "bg-primary text-black shadow-lg" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Standard
        </button>
        <button
          onClick={() => activeSleeveId && updateSleeve(activeSleeveId, { sleeveType: 'Japanese' })}
          className={cn(
            "px-6 py-2 rounded-full text-xs font-bold transition-all uppercase tracking-wider",
            isJapanese ? "bg-primary text-black shadow-lg" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Japanese
        </button>
      </div>

      <div className="relative shadow-[0_0_50px_rgba(0,0,0,0.8)] ring-1 ring-white/10 overflow-hidden bg-black flex-shrink-0 transition-all duration-300">
        <canvas ref={canvasRef} />
      </div>
      <p className="mt-8 text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
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
