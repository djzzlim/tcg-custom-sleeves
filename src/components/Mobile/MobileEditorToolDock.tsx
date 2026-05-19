'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { dispatchCanvasAction } from '@/lib/events';
import { cn } from '@/lib/utils';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sun,
  Contrast,
  Droplets,
  Palette,
  ScrollText,
  RotateCcw,
  Plus,
  Trash2,
} from 'lucide-react';
import { designHasUserPhoto } from '@/lib/packOrder';
import {
  EDITOR_PRESET_COLORS,
  FRAME_DEFAULT_TINT,
  TEXT_BACKGROUND_DEFAULT,
  TEXT_STROKE_DEFAULT,
} from '@/lib/colorPresets';
import { EDITOR_FRAME_CHOICES } from '@/lib/editorFrames';
import MobileDesignPreviewGrid from '@/components/Mobile/MobileDesignPreviewGrid';

type AdjustKey = 'sepia' | 'brightness' | 'contrast' | 'saturation' | 'hue';

const ADJUSTMENTS: {
  key: AdjustKey;
  label: string;
  icon: typeof Sun;
}[] = [
  { key: 'sepia', label: 'Sepia', icon: ScrollText },
  { key: 'brightness', label: 'Bright', icon: Sun },
  { key: 'contrast', label: 'Contrast', icon: Contrast },
  { key: 'saturation', label: 'Sat', icon: Droplets },
  { key: 'hue', label: 'Hue', icon: Palette },
];

export default function MobileEditorToolDock() {
  const {
    activeTab,
    activeObjectType,
    textProps,
    photoAdjustments,
    sleeves,
    activeSleeveId,
  } = useStore();

  const [activeAdjust, setActiveAdjust] = useState<AdjustKey>('brightness');

  const activeDesign = sleeves.find((s) => s.id === activeSleeveId);
  const showPhotoAdjustments = designHasUserPhoto(activeDesign);

  if (!activeTab || activeTab === 'Photos') return null;

  const adjustValue = photoAdjustments[activeAdjust];
  const adjustMeta = ADJUSTMENTS.find((a) => a.key === activeAdjust)!;

  return (
    <div
      className="shrink-0 border-t border-border bg-[#1a1a1a]/95 backdrop-blur-sm lg:hidden"
      aria-label={`${activeTab} tools`}
    >
      {activeTab === 'Adjustments' && (
        <div className="py-2">
          {showPhotoAdjustments ? (
            <>
              <div className="flex items-center gap-0.5 overflow-x-auto px-2 pb-1 [scrollbar-width:none]">
                {ADJUSTMENTS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveAdjust(key)}
                    className={cn(
                      'flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1 min-w-[3rem]',
                      activeAdjust === key
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground'
                    )}
                  >
                    <Icon size={18} strokeWidth={activeAdjust === key ? 2.25 : 2} />
                    <span className="text-[9px] font-medium">{label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => dispatchCanvasAction({ type: 'RESET_IMAGE_ADJUSTMENTS' })}
                  className="ml-auto flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-muted-foreground"
                  title="Reset adjustments"
                >
                  <RotateCcw size={17} />
                  <span className="text-[9px] font-medium">Reset</span>
                </button>
              </div>
              <div className="flex items-center gap-2 px-3">
                <span className="w-14 shrink-0 text-[10px] font-medium text-muted-foreground">
                  {adjustMeta.label}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={adjustValue}
                  onChange={(e) =>
                    dispatchCanvasAction({
                      type: 'SET_IMAGE_ADJUSTMENTS',
                      payload: { [activeAdjust]: Number(e.target.value) },
                    })
                  }
                  className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-muted/50 accent-primary [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                />
                <span className="w-7 shrink-0 text-right font-mono text-[10px] tabular-nums text-primary">
                  {adjustValue}
                </span>
              </div>
            </>
          ) : (
            <p className="px-3 py-1 text-center text-[10px] text-muted-foreground">
              Upload a photo first, then use these sliders.
            </p>
          )}
        </div>
      )}

      {activeTab === 'Frames' && (
        <div className="py-2">
          <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain px-2 pb-0.5 [scrollbar-width:thin]">
            {EDITOR_FRAME_CHOICES.map((frame) => (
              <button
                key={frame.id}
                type="button"
                onClick={() => dispatchCanvasAction({ type: 'APPLY_FRAME', payload: frame.id })}
                className="relative shrink-0 w-[3.25rem] aspect-[52/72] overflow-hidden rounded-md border border-border bg-[#a8a497] transition-colors hover:border-primary/60 active:scale-[0.98]"
                title={frame.label}
              >
                {frame.src ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={frame.src}
                    alt=""
                    className="absolute inset-0 h-full w-full object-fill pointer-events-none"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[8px] font-bold uppercase text-black/45">
                    None
                  </span>
                )}
              </button>
            ))}
          </div>
          {activeObjectType === 'frame' && (
            <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto px-2 [scrollbar-width:none]">
              <span className="shrink-0 text-[9px] text-muted-foreground">Tint</span>
              {EDITOR_PRESET_COLORS.map((c) => (
                <button
                  key={`frame-tint-${c}`}
                  type="button"
                  onClick={() => dispatchCanvasAction({ type: 'CHANGE_FRAME_COLOR', payload: c })}
                  className={cn(
                    'h-6 w-6 shrink-0 rounded-full border-2',
                    (textProps.fill || FRAME_DEFAULT_TINT).toLowerCase() === c.toLowerCase()
                      ? 'border-primary ring-1 ring-primary/50'
                      : 'border-border'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={textProps.fill || FRAME_DEFAULT_TINT}
                onChange={(e) =>
                  dispatchCanvasAction({ type: 'CHANGE_FRAME_COLOR', payload: e.target.value })
                }
                className="h-6 w-6 shrink-0 cursor-pointer rounded-full border border-border bg-transparent p-0"
                aria-label="Custom frame tint"
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'Text' && (
        <div className="flex flex-col gap-1.5 py-2">
        <div className="flex items-center gap-1 overflow-x-auto px-2 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => dispatchCanvasAction({ type: 'ADD_TEXT' })}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-[10px] font-semibold text-primary"
          >
            <Plus size={14} strokeWidth={2.5} />
            Add
          </button>
          <span className="h-6 w-px shrink-0 bg-border" aria-hidden />
          <button
            type="button"
            onClick={() => dispatchCanvasAction({ type: 'TOGGLE_FORMAT', payload: 'bold' })}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              textProps.fontWeight === 'bold' ? 'bg-primary/20 text-primary' : 'text-muted-foreground'
            )}
          >
            <Bold size={16} />
          </button>
          <button
            type="button"
            onClick={() => dispatchCanvasAction({ type: 'TOGGLE_FORMAT', payload: 'italic' })}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              textProps.fontStyle === 'italic' ? 'bg-primary/20 text-primary' : 'text-muted-foreground'
            )}
          >
            <Italic size={16} />
          </button>
          <button
            type="button"
            onClick={() => dispatchCanvasAction({ type: 'TOGGLE_FORMAT', payload: 'underline' })}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              textProps.underline ? 'bg-primary/20 text-primary' : 'text-muted-foreground'
            )}
          >
            <Underline size={16} />
          </button>
          <span className="h-6 w-px shrink-0 bg-border" aria-hidden />
          {(['left', 'center', 'right'] as const).map((align, i) => {
            const Icon = [AlignLeft, AlignCenter, AlignRight][i];
            return (
              <button
                key={align}
                type="button"
                onClick={() => dispatchCanvasAction({ type: 'SET_TEXT_ALIGN', payload: align })}
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  textProps.textAlign === align ? 'bg-primary/20 text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon size={16} />
              </button>
            );
          })}
          <span className="h-6 w-px shrink-0 bg-border" aria-hidden />
          <button
            type="button"
            onClick={() => dispatchCanvasAction({ type: 'CHANGE_FONT_SIZE', payload: -2 })}
            className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
          >
            −
          </button>
          <span className="w-7 shrink-0 text-center font-mono text-[11px] tabular-nums">
            {textProps.fontSize}
          </span>
          <button
            type="button"
            onClick={() => dispatchCanvasAction({ type: 'CHANGE_FONT_SIZE', payload: 2 })}
            className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
          >
            +
          </button>
          {activeObjectType === 'i-text' && (
            <>
              <span className="h-6 w-px shrink-0 bg-border" aria-hidden />
              <button
                type="button"
                onClick={() => dispatchCanvasAction({ type: 'DELETE_ACTIVE_TEXT' })}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-destructive/90"
                title="Delete text"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>

        {activeObjectType === 'i-text' && (
          <>
            <div className="flex items-center gap-1.5 overflow-x-auto border-t border-border/60 px-2 pt-1.5 [scrollbar-width:none]">
              <span className="shrink-0 text-[9px] font-semibold uppercase text-muted-foreground">
                Border
              </span>
              <button
                type="button"
                onClick={() => dispatchCanvasAction({ type: 'CHANGE_TEXT_STROKE_WIDTH', payload: 0 })}
                className={cn(
                  'relative h-7 w-7 shrink-0 overflow-hidden rounded-md border-2 bg-black/30',
                  (textProps.strokeWidth || 0) === 0
                    ? 'border-primary ring-1 ring-primary/50'
                    : 'border-border'
                )}
                title="No border"
                aria-label="No border"
              >
                <span className="absolute left-1/2 top-1/2 h-px w-[140%] -translate-x-1/2 -translate-y-1/2 rotate-[-35deg] bg-white/70" />
              </button>
              <button
                type="button"
                onClick={() => {
                  dispatchCanvasAction({ type: 'CHANGE_TEXT_STROKE_COLOR', payload: TEXT_STROKE_DEFAULT });
                  dispatchCanvasAction({ type: 'CHANGE_TEXT_STROKE_WIDTH', payload: 4 });
                }}
                className={cn(
                  'shrink-0 rounded-md border px-1.5 py-1 text-[8px] font-semibold uppercase',
                  (textProps.strokeWidth || 0) > 0 &&
                    textProps.stroke.toLowerCase() === TEXT_STROKE_DEFAULT.toLowerCase()
                    ? 'border-primary text-primary'
                    : 'border-border text-muted-foreground'
                )}
              >
                Def
              </button>
              {EDITOR_PRESET_COLORS.map((c) => (
                <button
                  key={`text-stroke-${c}`}
                  type="button"
                  onClick={() => {
                    dispatchCanvasAction({ type: 'CHANGE_TEXT_STROKE_COLOR', payload: c });
                    if ((textProps.strokeWidth || 0) === 0) {
                      dispatchCanvasAction({ type: 'CHANGE_TEXT_STROKE_WIDTH', payload: 4 });
                    }
                  }}
                  className={cn(
                    'h-7 w-7 shrink-0 rounded-md border-2',
                    textProps.stroke.toLowerCase() === c.toLowerCase()
                      ? 'border-primary ring-1 ring-primary/50'
                      : 'border-border'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={textProps.stroke}
                onChange={(e) => {
                  dispatchCanvasAction({ type: 'CHANGE_TEXT_STROKE_COLOR', payload: e.target.value });
                  if ((textProps.strokeWidth || 0) === 0) {
                    dispatchCanvasAction({ type: 'CHANGE_TEXT_STROKE_WIDTH', payload: 4 });
                  }
                }}
                className="h-7 w-7 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0"
                aria-label="Custom border color"
              />
              <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
              <button
                type="button"
                onClick={() =>
                  dispatchCanvasAction({
                    type: 'CHANGE_TEXT_STROKE_WIDTH',
                    payload: Math.max(0, (textProps.strokeWidth || 0) - 1),
                  })
                }
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground"
              >
                −
              </button>
              <span className="w-6 shrink-0 text-center font-mono text-[10px] tabular-nums text-primary">
                {textProps.strokeWidth}
              </span>
              <button
                type="button"
                onClick={() =>
                  dispatchCanvasAction({
                    type: 'CHANGE_TEXT_STROKE_WIDTH',
                    payload: (textProps.strokeWidth || 0) + 1,
                  })
                }
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground"
              >
                +
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto border-t border-border/60 px-2 pt-1.5 [scrollbar-width:none]">
              <span className="shrink-0 text-[9px] font-semibold uppercase text-muted-foreground">
                Bg
              </span>
              <button
                type="button"
                onClick={() => dispatchCanvasAction({ type: 'TOGGLE_TEXT_BACKGROUND' })}
                className={cn(
                  'shrink-0 rounded-lg border px-2 py-1.5 text-[9px] font-semibold uppercase',
                  textProps.backgroundEnabled
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border text-muted-foreground'
                )}
              >
                {textProps.backgroundEnabled ? 'On' : 'Off'}
              </button>
              {textProps.backgroundEnabled && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      dispatchCanvasAction({
                        type: 'CHANGE_TEXT_BACKGROUND_COLOR',
                        payload: TEXT_BACKGROUND_DEFAULT,
                      })
                    }
                    className={cn(
                      'shrink-0 rounded-md border px-1.5 py-1 text-[8px] font-semibold uppercase',
                      textProps.backgroundColor.toLowerCase() === TEXT_BACKGROUND_DEFAULT.toLowerCase()
                        ? 'border-primary text-primary'
                        : 'border-border text-muted-foreground'
                    )}
                  >
                    Def
                  </button>
                  {EDITOR_PRESET_COLORS.map((c) => (
                    <button
                      key={`text-bg-${c}`}
                      type="button"
                      onClick={() =>
                        dispatchCanvasAction({ type: 'CHANGE_TEXT_BACKGROUND_COLOR', payload: c })
                      }
                      className={cn(
                        'h-7 w-7 shrink-0 rounded-md border-2',
                        textProps.backgroundColor.toLowerCase() === c.toLowerCase()
                          ? 'border-primary ring-1 ring-primary/50'
                          : 'border-border'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={textProps.backgroundColor}
                    onChange={(e) =>
                      dispatchCanvasAction({
                        type: 'CHANGE_TEXT_BACKGROUND_COLOR',
                        payload: e.target.value,
                      })
                    }
                    className="h-7 w-7 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0"
                    aria-label="Custom text background"
                  />
                </>
              )}
            </div>
          </>
        )}
        </div>
      )}

      {activeTab === 'Preview' && <MobileDesignPreviewGrid variant="strip" />}
    </div>
  );
}
