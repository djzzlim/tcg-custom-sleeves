'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { dispatchCanvasAction } from '@/lib/events';
import { cn } from '@/lib/utils';
import {
  EDITOR_PRESET_COLORS,
  TEXT_COLOR_GRID,
  TEXT_FILL_DEFAULT,
} from '@/lib/colorPresets';
import { X, Pipette, Palette, Check } from 'lucide-react';

const FONT_OPTIONS = [
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
  'Arial',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Verdana',
] as const;

function ColorSwatchGrid({
  value,
  onPick,
  palette,
  columns = 8,
}: {
  value: string;
  onPick: (hex: string) => void;
  palette: string[];
  columns?: number;
}) {
  const norm = value.toLowerCase();
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {palette.map((c, idx) => (
        <button
          key={`${c}-${idx}`}
          type="button"
          title={c}
          onClick={() => onPick(c)}
          className={cn(
            'aspect-square rounded-full border-2 transition-transform hover:scale-105',
            norm === c.toLowerCase()
              ? 'border-primary ring-2 ring-primary/50 scale-105'
              : 'border-white/15 hover:border-white/40'
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function TextFillPresetRow({
  value,
  onPick,
}: {
  value: string;
  onPick: (hex: string) => void;
}) {
  const norm = value.toLowerCase();
  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPick(TEXT_FILL_DEFAULT)}
          className={cn(
            'rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors',
            norm === TEXT_FILL_DEFAULT.toLowerCase()
              ? 'border-primary ring-2 ring-primary/50 bg-primary/10 text-primary'
              : 'border-white/15 text-muted-foreground hover:border-white/30 hover:text-foreground'
          )}
        >
          Default
        </button>
        {EDITOR_PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onPick(c)}
            className={cn(
              'h-7 w-7 shrink-0 rounded-full border-2 transition-transform hover:scale-105',
              norm === c.toLowerCase()
                ? 'border-primary ring-2 ring-primary/50 scale-105'
                : 'border-white/15 hover:border-white/40'
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">All colors</p>
    </div>
  );
}

export default function TextCanvasToolbar() {
  const { activeObjectType, textProps } = useStore();
  const [desktopPickerOpen, setDesktopPickerOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [eyeDropperSupported, setEyeDropperSupported] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEyeDropperSupported(typeof window !== 'undefined' && 'EyeDropper' in window);
  }, []);

  useEffect(() => {
    if (activeObjectType !== 'i-text') {
      setDesktopPickerOpen(false);
      setMobileSheetOpen(false);
    }
  }, [activeObjectType]);

  useEffect(() => {
    if (!desktopPickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (barRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setDesktopPickerOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [desktopPickerOpen]);

  const applyColor = (hex: string) => {
    dispatchCanvasAction({ type: 'CHANGE_COLOR', payload: hex });
    // Match the font dropdown UX: pick a color => close immediately.
    setDesktopPickerOpen(false);
    setMobileSheetOpen(false);
  };

  const tryEyeDropper = async () => {
    const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } })
      .EyeDropper;
    if (!ED) return;
    try {
      const dropper = new ED();
      const { sRGBHex } = await dropper.open();
      applyColor(sRGBHex);
    } catch {
      /* user cancelled */
    }
  };

  if (activeObjectType !== 'i-text') return null;

  const openColorUi = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      setDesktopPickerOpen((v) => !v);
    } else {
      setMobileSheetOpen((v) => !v);
    }
  };

  return (
    <>
      <div className="relative z-30 mb-2 w-full max-w-[400px] mx-auto px-1 lg:mb-4">
        <div
          ref={barRef}
          className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1a1a1a]/95 backdrop-blur-md px-2 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
        >
          <button
            type="button"
            onClick={openColorUi}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-white/20 shadow-inner transition hover:border-primary/60"
            style={{ backgroundColor: textProps.fill }}
            title="Text color"
            aria-label="Open text color"
          />

          <select
            value={textProps.fontFamily}
            onChange={(e) =>
              dispatchCanvasAction({ type: 'CHANGE_FONT_FAMILY', payload: e.target.value })
            }
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-sm text-foreground outline-none focus:border-primary"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => dispatchCanvasAction({ type: 'DISCARD_CANVAS_SELECTION' })}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            title="Done editing"
            aria-label="Done editing text"
          >
            <Check size={18} />
          </button>

          <button
            type="button"
            onClick={() => dispatchCanvasAction({ type: 'DELETE_ACTIVE_TEXT' })}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-destructive/40 text-destructive/90 transition hover:bg-destructive/15"
            title="Delete this text layer"
            aria-label="Delete text layer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mobile: inline color strip (no full-screen sheet) */}
        {mobileSheetOpen && (
          <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto px-0.5 pb-0.5 lg:hidden [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => applyColor(TEXT_FILL_DEFAULT)}
              className={cn(
                'shrink-0 rounded-md border px-2 py-1 text-[9px] font-semibold uppercase',
                textProps.fill.toLowerCase() === TEXT_FILL_DEFAULT.toLowerCase()
                  ? 'border-primary text-primary'
                  : 'border-white/15 text-muted-foreground'
              )}
            >
              Def
            </button>
            {EDITOR_PRESET_COLORS.map((c) => (
              <button
                key={`m-${c}`}
                type="button"
                onClick={() => applyColor(c)}
                className={cn(
                  'h-7 w-7 shrink-0 rounded-full border-2',
                  textProps.fill.toLowerCase() === c.toLowerCase()
                    ? 'border-primary ring-1 ring-primary/50'
                    : 'border-white/15'
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="color"
              value={textProps.fill}
              onChange={(e) => applyColor(e.target.value)}
              className="h-7 w-7 shrink-0 cursor-pointer rounded-full border border-white/20 bg-transparent p-0"
              aria-label="Custom text color"
            />
          </div>
        )}

        {/* Desktop: floating palette */}
        {desktopPickerOpen && (
          <div
            ref={popoverRef}
            className="absolute left-1/2 top-full z-40 mt-2 hidden w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 lg:block"
          >
            <div className="rounded-2xl border border-white/10 bg-[#1e1e1e] p-3 shadow-2xl">
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-white/5 pb-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Palette size={14} className="text-primary" />
                  Text color
                </div>
                {eyeDropperSupported && (
                  <button
                    type="button"
                    onClick={() => void tryEyeDropper()}
                    className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    title="Pick from screen"
                  >
                    <Pipette size={14} />
                    Pick
                  </button>
                )}
              </div>
              <TextFillPresetRow value={textProps.fill} onPick={applyColor} />
              <ColorSwatchGrid value={textProps.fill} onPick={applyColor} palette={TEXT_COLOR_GRID} />
              <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 hover:bg-black/40">
                <input
                  type="color"
                  value={textProps.fill}
                  onChange={(e) => applyColor(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border border-white/20 bg-transparent p-0"
                  aria-label="Custom color"
                />
                <span className="text-xs text-muted-foreground">Custom color</span>
                <span className="ml-auto font-mono text-[10px] text-foreground/80">{textProps.fill}</span>
              </label>
            </div>
          </div>
        )}
      </div>

    </>
  );
}
