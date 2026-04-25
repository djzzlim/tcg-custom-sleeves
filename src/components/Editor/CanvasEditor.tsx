'use client';

import { useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { CanvasAction } from '@/lib/events';
import { Canvas, IText, FabricImage, Rect } from 'fabric';

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 560; // 5:7 ratio

export default function CanvasEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvas = useRef<Canvas | null>(null);
  const { activeSleeveId, updateSleeve, sleeves, setActiveObjectType, setTextProps } = useStore();

  useEffect(() => {
    if (!canvasRef.current || fabricCanvas.current) return;

    const canvas = new Canvas(canvasRef.current, {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: '#000000',
    });

    fabricCanvas.current = canvas;

    const activeSleeve = sleeves.find(s => s.id === activeSleeveId);
    if (activeSleeve?.canvasData) {
      canvas.loadFromJSON(JSON.parse(activeSleeve.canvasData)).then(() => {
        canvas.renderAll();
      });
    }

    const updateActiveObjectState = () => {
      const active = canvas.getActiveObject();
      if (!active) {
        setActiveObjectType(null);
        return;
      }
      setActiveObjectType(active.type);
      if (active.type === 'i-text') {
        const textObj = active as IText;
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

        if (objHeight > CANVAS_HEIGHT) {
          minY = CANVAS_HEIGHT - objHeight / 2;
          maxY = objHeight / 2;
        } else {
          minY = objHeight / 2;
          maxY = CANVAS_HEIGHT - objHeight / 2;
        }

        obj.set({
          left: Math.max(minX, Math.min(obj.left as number, maxX)),
          top: Math.max(minY, Math.min(obj.top as number, maxY))
        });
      }
    });
    
    const saveToStore = () => {
      if (!fabricCanvas.current || !activeSleeveId) return;
      const json = JSON.stringify(fabricCanvas.current.toJSON());
      const dataUrl = fabricCanvas.current.toDataURL({ format: 'png', quality: 0.5, multiplier: 1 });
      updateSleeve(activeSleeveId, { canvasData: json, previewUrl: dataUrl });
    };

    canvas.on('object:modified', () => {
      updateActiveObjectState();
      saveToStore();
    });
    
    canvas.on('object:added', (e) => {
      const frame = canvas.getObjects().find((obj: any) => obj.isFrame);
      if (frame && e.target !== frame) {
        canvas.bringObjectToFront(frame);
      }
      saveToStore();
    });
    
    canvas.on('object:removed', saveToStore);

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
              const scale = Math.max(CANVAS_WIDTH / img.width, CANVAS_HEIGHT / img.height);
              img.set({
                scaleX: scale,
                scaleY: scale,
                left: CANVAS_WIDTH / 2,
                top: CANVAS_HEIGHT / 2,
                originX: 'center',
                originY: 'center',
              });
              cvs.add(img);
              cvs.sendObjectToBack(img);
              cvs.renderAll();
              saveToStore();
            });
          };
          reader.readAsDataURL(action.payload);
          break;
        }
        case 'ADD_TEXT': {
          const text = new IText('Double click to edit', {
            left: CANVAS_WIDTH / 2,
            top: CANVAS_HEIGHT / 2,
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
          const existing = cvs.getObjects().filter((obj: any) => obj.isFrame);
          existing.forEach(obj => cvs.remove(obj));

          if (type !== 'none') {
            const frameOptions: Record<string, { stroke: string; strokeWidth: number }> = {
              'black': { stroke: '#000000', strokeWidth: 16 },
              'white': { stroke: '#ffffff', strokeWidth: 16 },
              'silver': { stroke: '#c0c0c0', strokeWidth: 16 },
              'gold': { stroke: '#ffd700', strokeWidth: 16 },
              'copper': { stroke: '#b87333', strokeWidth: 16 },
            };
            const opt = frameOptions[type];
            if (opt) {
              const border = new Rect({
                width: CANVAS_WIDTH - opt.strokeWidth,
                height: CANVAS_HEIGHT - opt.strokeWidth,
                left: CANVAS_WIDTH / 2,
                top: CANVAS_HEIGHT / 2,
                originX: 'center',
                originY: 'center',
                fill: 'transparent',
                stroke: opt.stroke,
                strokeWidth: opt.strokeWidth,
                selectable: false,
                evented: false,
                hoverCursor: 'default',
              });
              (border as any).isFrame = true;
              cvs.add(border);
              cvs.bringObjectToFront(border);
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
      canvas.dispose();
      fabricCanvas.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-8 overflow-auto bg-[#2b2b2b]">
      <div className="relative shadow-[0_0_50px_rgba(0,0,0,0.8)] ring-1 ring-white/10 overflow-hidden bg-black flex-shrink-0">
        <canvas ref={canvasRef} />
      </div>
      <p className="mt-8 text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
        Standard Sleeve (5:7 Ratio)
      </p>
    </div>
  );
}
