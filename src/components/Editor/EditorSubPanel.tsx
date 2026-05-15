'use client';

import { useStore } from '@/store/useStore';
import { dispatchCanvasAction } from '@/lib/events';
import {
  Upload,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  Sun,
  Contrast,
  Droplets,
  Palette,
  ScrollText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  EDITOR_PRESET_COLORS,
  FRAME_DEFAULT_TINT,
  TEXT_BACKGROUND_DEFAULT,
  TEXT_STROKE_DEFAULT,
} from '@/lib/colorPresets';
import { useRef, useState } from 'react';
import {
  designHasUserPhoto,
  shouldBlockNextImageUpload,
  totalOrderSleeves,
} from '@/lib/packOrder';
import {
  INPUT_ACCEPT,
  MAX_INPUT_BYTES,
  formatBytes,
  validateUploadedImage,
} from '@/lib/imageValidation';

export default function EditorSubPanel() {
  const {
    activeTab,
    activeObjectType,
    textProps,
    photoAdjustments,
    packs,
    sleeves,
    activeSleeveId,
    sessionImageUploadCount,
    setActiveTab,
  } = useStore();
  const totalCap = totalOrderSleeves(packs);
  const hasPack = packs.length > 0;
  const activeDesign = sleeves.find((s) => s.id === activeSleeveId);
  const replacingPhoto = designHasUserPhoto(activeDesign);
  const showPhotoAdjustments = replacingPhoto;
  const canUploadImage =
    hasPack && (replacingPhoto || !shouldBlockNextImageUpload(packs, sessionImageUploadCount));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!activeTab) return null;

  return (
    <>
      {/* Mobile backdrop — tap to close. */}
      <div
        className="lg:hidden fixed inset-0 bg-black/40 z-30"
        onClick={() => setActiveTab(null)}
        aria-hidden
      />
      <div
        className={cn(
          // Desktop: inline left panel.
          'lg:relative lg:w-72 lg:h-full lg:rounded-none lg:border-r lg:border-t-0 lg:bottom-auto lg:left-auto lg:right-auto lg:max-h-none lg:shadow-none',
          // Mobile: bottom sheet sitting above the bottom nav (h-16).
          'fixed left-0 right-0 bottom-16 max-h-[70vh] z-40 rounded-t-2xl border-t border-border shadow-2xl',
          'bg-[#222222] overflow-y-auto p-4 flex flex-col'
        )}
      >
        {/* Mobile-only grab handle. */}
        <div className="lg:hidden flex items-center justify-center mb-2">
          <span className="block h-1 w-10 rounded-full bg-white/20" aria-hidden />
        </div>
        <h2 className="text-xl font-serif italic mb-4">{activeTab}</h2>

      {activeTab === 'Photos' && (
        <div className="flex flex-col gap-6">
          <section>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Add image
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            </div>
            <button
              type="button"
              disabled={!canUploadImage}
              title={
                !hasPack
                  ? 'Create a pack on the right (Start designing), then you can upload.'
                  : !canUploadImage
                    ? 'You have reached the upload limit for this order.'
                    : 'Upload a JPG or PNG'
              }
              onClick={() => {
                if (!canUploadImage) return;
                fileInputRef.current?.click();
              }}
              className={cn(
                'group relative w-full overflow-hidden rounded-2xl border-2 border-dashed px-4 py-7 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                canUploadImage
                  ? 'border-primary/35 bg-gradient-to-b from-primary/[0.08] via-transparent to-black/20 hover:border-primary/55 hover:from-primary/[0.12]'
                  : 'cursor-not-allowed border-border/60 bg-black/20 opacity-60'
              )}
            >
              <div className="flex flex-col items-center gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] ring-1 ring-primary/20 transition group-hover:bg-primary/20 group-hover:ring-primary/35">
                  <Upload size={26} strokeWidth={2.25} />
                </span>
                <div className="text-center">
                  <span className="block text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {replacingPhoto ? 'Replace photo' : 'Upload images'}
                  </span>
                  <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                    {replacingPhoto
                      ? 'Pick a new file to replace the current photo on this design'
                      : 'JPG or PNG · fills the sleeve; drag on canvas to reposition'}
                  </span>
                  <span className="mt-2 block text-[10px] text-muted-foreground">
                    PNG or JPG · up to {formatBytes(MAX_INPUT_BYTES)}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {hasPack ? (
                      <>
                        Image uploads this session:{' '}
                        <span className="font-mono text-foreground">
                          {sessionImageUploadCount}
                        </span>{' '}
                        / {totalCap} (one per sleeve across all your packs)
                      </>
                    ) : (
                      <>
                        Add a pack first — pick a size on the right, then{' '}
                        <span className="text-foreground">Start designing</span>, before uploading.
                      </>
                    )}
                  </span>
                </div>
              </div>
            </button>
            {uploadError && (
              <p
                role="alert"
                className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive"
              >
                {uploadError}
              </p>
            )}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              disabled={!canUploadImage}
              accept={INPUT_ACCEPT}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadError(null);
                const { packs: ps, sleeves: ss, activeSleeveId: aid, sessionImageUploadCount: uploads } =
                  useStore.getState();
                const cap = totalOrderSleeves(ps);
                const design = ss.find((s) => s.id === aid);
                const isReplace = designHasUserPhoto(design);
                if (ps.length === 0) {
                  setUploadError(
                    'Create a pack first: choose 65 or 110 sleeves on the right, then tap Start designing.'
                  );
                  e.target.value = '';
                  return;
                }
                if (!isReplace && shouldBlockNextImageUpload(ps, uploads)) {
                  setUploadError(
                    `You can upload at most ${cap} images in this session (one per sleeve across all your packs).`
                  );
                  e.target.value = '';
                  return;
                }
                const validation = await validateUploadedImage(file);
                if (!validation.ok) {
                  setUploadError(validation.error.message);
                  e.target.value = '';
                  return;
                }
                dispatchCanvasAction({ type: 'UPLOAD_IMAGE', payload: file });
                e.target.value = '';
              }}
            />
          </section>

          {showPhotoAdjustments && (
          <section className="rounded-2xl border border-white/[0.06] bg-black/25 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Adjustments
                </h3>
                <p className="mt-1.5 max-w-[240px] text-[11px] leading-relaxed text-muted-foreground">
                  Affects the photo you selected on the canvas. If nothing is selected, we use the top image layer.
                </p>
              </div>
              {activeObjectType === 'image' ? (
                <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Editing
                </span>
              ) : (
                <span className="shrink-0 rounded-full border border-border/80 bg-background/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                  Auto
                </span>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {[
                {
                  key: 'sepia' as const,
                  label: 'Sepia',
                  hint: 'Warm vintage tone',
                  icon: ScrollText,
                  value: photoAdjustments.sepia,
                },
                {
                  key: 'brightness' as const,
                  label: 'Brightness',
                  hint: '50 = original',
                  icon: Sun,
                  value: photoAdjustments.brightness,
                },
                {
                  key: 'contrast' as const,
                  label: 'Contrast',
                  hint: '50 = original',
                  icon: Contrast,
                  value: photoAdjustments.contrast,
                },
                {
                  key: 'saturation' as const,
                  label: 'Saturation',
                  hint: '50 = original',
                  icon: Droplets,
                  value: photoAdjustments.saturation,
                },
                {
                  key: 'hue' as const,
                  label: 'Hue',
                  hint: '50 = no shift',
                  icon: Palette,
                  value: photoAdjustments.hue,
                },
              ].map(({ key, label, hint, icon: Icon, value }) => (
                <div
                  key={key}
                  className="rounded-xl border border-white/[0.05] bg-[#1a1a1a]/80 px-3 py-2.5 transition-colors hover:border-white/[0.08]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/35 text-primary/90 ring-1 ring-white/[0.06]"
                      title={label}
                    >
                      <Icon size={18} strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-semibold text-foreground">{label}</span>
                        <span className="font-mono text-[11px] tabular-nums text-primary/90">{value}</span>
                      </div>
                      <p className="mb-2 text-[10px] text-muted-foreground">{hint}</p>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={value}
                        onChange={(e) =>
                          dispatchCanvasAction({
                            type: 'SET_IMAGE_ADJUSTMENTS',
                            payload: { [key]: Number(e.target.value) },
                          })
                        }
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted/50 accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => dispatchCanvasAction({ type: 'RESET_IMAGE_ADJUSTMENTS' })}
              className="mt-4 w-full rounded-xl border border-border py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            >
              Reset all adjustments
            </button>
          </section>
          )}
        </div>
      )}

      {activeTab === 'Frames' && (
        <div className="flex flex-col gap-4">
          {activeObjectType === 'frame' ? (
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <h3 className="text-sm font-semibold uppercase">Frame Properties</h3>
              <p className="text-xs text-muted-foreground mb-2">Click anywhere else on the canvas to see other frames.</p>
              <div className="rounded-xl border border-border bg-black/15 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Frame tint
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      dispatchCanvasAction({ type: 'CHANGE_FRAME_COLOR', payload: FRAME_DEFAULT_TINT })
                    }
                    className={cn(
                      'rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors',
                      (textProps.fill || FRAME_DEFAULT_TINT).toLowerCase() === FRAME_DEFAULT_TINT.toLowerCase()
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                    )}
                  >
                    Default
                  </button>
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  {EDITOR_PRESET_COLORS.map((c) => (
                    <button
                      key={`frame-${c}`}
                      type="button"
                      title={c}
                      onClick={() => dispatchCanvasAction({ type: 'CHANGE_FRAME_COLOR', payload: c })}
                      className={cn(
                        'h-8 w-8 shrink-0 rounded-full border-2 transition-transform hover:scale-105',
                        (textProps.fill || '').toLowerCase() === c.toLowerCase()
                          ? 'border-primary ring-2 ring-primary/50 scale-105'
                          : 'border-border hover:border-foreground/40'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background/30 px-2 py-2 hover:bg-background/40">
                  <input
                    type="color"
                    value={textProps.fill || FRAME_DEFAULT_TINT}
                    onChange={(e) =>
                      dispatchCanvasAction({ type: 'CHANGE_FRAME_COLOR', payload: e.target.value })
                    }
                    className="h-9 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
                    aria-label="Custom frame tint"
                  />
                  <div className="flex min-w-0 flex-col leading-tight">
                    <span className="text-[11px] font-semibold text-foreground">Custom</span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">
                      {textProps.fill || FRAME_DEFAULT_TINT}
                    </span>
                  </div>
                </label>
              </div>
              <button
                onClick={() => dispatchCanvasAction({ type: 'APPLY_FRAME', payload: 'none' })}
                className="w-full py-2 mt-4 border border-destructive/50 text-destructive rounded text-sm hover:bg-destructive/10 transition-colors"
              >
                Remove Frame
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-foreground">Choose a frame style:</p>
              <div className="grid grid-cols-2 gap-[2px] bg-border p-[2px] border border-border">
                {[
                  { id: 'none', label: 'Sleeveless', src: null },
                  { id: 'standard', src: '/frames/01.svg?v=8' },
                  { id: 'fade', src: '/frames/02.svg?v=8' },
                  { id: 'torn1', src: '/frames/03.svg?v=8' },
                  { id: 'torn2', src: '/frames/04.svg?v=8' },
                  { id: 'wobble', src: '/frames/05.svg?v=8' },
                  { id: 'floral', src: '/frames/06.svg?v=8' },
                  { id: 'scallop', src: '/frames/07.svg?v=8' },
                  { id: 'stamp', src: '/frames/08.svg?v=8' },
                  { id: 'wavy', src: '/frames/09.svg?v=8' },
                  { id: 'zigzag', src: '/frames/10.svg?v=8' },
                ].map((frame) => (
                  <button
                    key={frame.id}
                    onClick={() => dispatchCanvasAction({ type: 'APPLY_FRAME', payload: frame.id })}
                    className="aspect-[4/5] bg-[#f2ce1b] hover:brightness-110 relative overflow-hidden flex items-center justify-center transition-all group border-2 border-transparent hover:border-primary"
                  >
                    <div className="w-[85%] h-[85%] bg-[#a8a497] rotate-[-5deg] relative transition-transform group-hover:rotate-0 flex items-center justify-center overflow-hidden">
                      {frame.src ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={frame.src} alt={frame.id} className="absolute inset-0 w-full h-full object-fill pointer-events-none" />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center p-2">
                          <span className="text-[10px] font-bold text-black/40 uppercase tracking-tighter leading-none">No</span>
                          <span className="text-[10px] font-bold text-black/40 uppercase tracking-tighter leading-none">Frame</span>
                        </div>
                      )}
                    </div>
                    {frame.label && (
                       <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-white py-0.5 text-center font-bold uppercase">
                         {frame.label}
                       </div>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'Text' && (
        <div className="flex flex-col gap-4">
          <button
            className="w-full flex items-center gap-2 border border-primary rounded-full py-2 px-4 text-primary hover:bg-primary/10 transition-colors"
            onClick={() => dispatchCanvasAction({ type: 'ADD_TEXT' })}
          >
            <span className="text-lg leading-none">+</span> Add text
          </button>

          {activeObjectType === 'i-text' && (
            <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase">Text Properties</h3>
                <button
                  onClick={() => dispatchCanvasAction({ type: 'DELETE_ACTIVE_TEXT' })}
                  className="w-9 h-9 rounded-full border border-border bg-black/20 hover:bg-destructive/10 hover:border-destructive/50 text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center"
                  title="Delete text"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Text color and font: use the bar above the sleeve preview. Here you can adjust outline, background, and alignment.
              </p>

              {/* Text Border / Stroke */}
              <div className="rounded-xl border border-border bg-black/15 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Border (stroke)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        dispatchCanvasAction({ type: 'CHANGE_TEXT_STROKE_COLOR', payload: TEXT_STROKE_DEFAULT });
                        dispatchCanvasAction({ type: 'CHANGE_TEXT_STROKE_WIDTH', payload: 4 });
                      }}
                      className={cn(
                        'rounded-lg border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
                        (textProps.strokeWidth || 0) > 0 &&
                          textProps.stroke.toLowerCase() === TEXT_STROKE_DEFAULT
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                      )}
                    >
                      Default
                    </button>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{textProps.strokeWidth}px</span>
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => dispatchCanvasAction({ type: 'CHANGE_TEXT_STROKE_WIDTH', payload: 0 })}
                    className={cn(
                      'h-9 w-9 shrink-0 rounded-lg border transition-all relative overflow-hidden bg-black/30',
                      (textProps.strokeWidth || 0) === 0
                        ? 'border-primary ring-2 ring-primary/60 scale-[1.02]'
                        : 'border-border hover:border-foreground/40 hover:scale-[1.02]'
                    )}
                    title="No border"
                    aria-label="No border"
                  >
                    <span className="absolute inset-0 opacity-70" />
                    <span className="absolute left-1/2 top-1/2 h-[2px] w-[140%] -translate-x-1/2 -translate-y-1/2 rotate-[-35deg] bg-white/70" />
                  </button>

                  {EDITOR_PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={cn(
                        'h-9 w-9 shrink-0 rounded-lg border transition-all',
                        textProps.stroke.toLowerCase() === c.toLowerCase()
                          ? 'border-primary ring-2 ring-primary/60 scale-[1.02]'
                          : 'border-border hover:border-foreground/40 hover:scale-[1.02]'
                      )}
                      style={{ backgroundColor: c }}
                      onClick={() => {
                        dispatchCanvasAction({ type: 'CHANGE_TEXT_STROKE_COLOR', payload: c });
                        if ((textProps.strokeWidth || 0) === 0) {
                          dispatchCanvasAction({ type: 'CHANGE_TEXT_STROKE_WIDTH', payload: 4 });
                        }
                      }}
                      title={c}
                    />
                  ))}

                  <label
                    className={cn(
                      'flex h-9 min-w-[7.5rem] flex-1 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background/30 px-2 transition-colors hover:bg-background/40',
                      'focus-within:ring-2 focus-within:ring-primary/60 focus-within:border-primary'
                    )}
                    title="Custom border color"
                  >
                    <input
                      type="color"
                      value={textProps.stroke}
                      onChange={(e) =>
                        dispatchCanvasAction({ type: 'CHANGE_TEXT_STROKE_COLOR', payload: e.target.value })
                      }
                      className="h-7 w-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
                      aria-label="Custom stroke color"
                    />
                    <div className="flex min-w-0 flex-col leading-tight">
                      <span className="text-[11px] font-semibold text-foreground">Custom</span>
                      <span className="truncate font-mono text-[10px] text-muted-foreground">{textProps.stroke}</span>
                    </div>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => dispatchCanvasAction({ type: 'CHANGE_TEXT_STROKE_WIDTH', payload: Math.max(0, (textProps.strokeWidth || 0) - 1) })}
                    className="h-9 w-12 rounded-lg border border-border bg-background/30 hover:bg-background/40 transition-colors"
                    title="Decrease border"
                  >
                    –
                  </button>
                  <div className="flex-1 h-9 rounded-lg border border-border bg-background/20 flex items-center justify-center font-mono text-sm">
                    {textProps.strokeWidth}
                  </div>
                  <button
                    onClick={() => dispatchCanvasAction({ type: 'CHANGE_TEXT_STROKE_WIDTH', payload: (textProps.strokeWidth || 0) + 1 })}
                    className="h-9 w-12 rounded-lg border border-border bg-background/30 hover:bg-background/40 transition-colors"
                    title="Increase border"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Background behind text */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Background</label>
                  <button
                    onClick={() => dispatchCanvasAction({ type: 'TOGGLE_TEXT_BACKGROUND' })}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs border transition-colors",
                      textProps.backgroundEnabled ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {textProps.backgroundEnabled ? 'On' : 'Off'}
                  </button>
                </div>
                {textProps.backgroundEnabled && (
                  <div className="flex flex-col gap-2 rounded-xl border border-border bg-black/15 p-3">
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          dispatchCanvasAction({
                            type: 'CHANGE_TEXT_BACKGROUND_COLOR',
                            payload: TEXT_BACKGROUND_DEFAULT,
                          })
                        }
                        className={cn(
                          'rounded-lg border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
                          textProps.backgroundColor.toLowerCase() === TEXT_BACKGROUND_DEFAULT
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                        )}
                      >
                        Default
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {EDITOR_PRESET_COLORS.map((c) => (
                        <button
                          key={`bg-${c}`}
                          type="button"
                          className={cn(
                            'h-8 w-8 shrink-0 rounded-lg border-2 transition-transform hover:scale-105',
                            textProps.backgroundColor.toLowerCase() === c.toLowerCase()
                              ? 'border-primary ring-2 ring-primary/50 scale-105'
                              : 'border-border hover:border-foreground/40'
                          )}
                          style={{ backgroundColor: c }}
                          onClick={() =>
                            dispatchCanvasAction({ type: 'CHANGE_TEXT_BACKGROUND_COLOR', payload: c })
                          }
                          title={c}
                        />
                      ))}
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background/30 px-2 py-1.5 hover:bg-background/40">
                        <input
                          type="color"
                          value={textProps.backgroundColor}
                          onChange={(e) =>
                            dispatchCanvasAction({
                              type: 'CHANGE_TEXT_BACKGROUND_COLOR',
                              payload: e.target.value,
                            })
                          }
                          className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
                          title="Custom background color"
                          aria-label="Custom background color"
                        />
                        <div className="flex min-w-0 flex-col leading-tight">
                          <span className="text-[11px] font-semibold text-foreground">Custom</span>
                          <span className="truncate font-mono text-[10px] text-muted-foreground">
                            {textProps.backgroundColor}
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 bg-background p-1 rounded border border-border">
                <button
                  onClick={() => dispatchCanvasAction({ type: 'TOGGLE_FORMAT', payload: 'bold' })}
                  className={cn("flex-1 py-1 rounded flex justify-center hover:bg-muted", textProps.fontWeight === 'bold' && "bg-primary/20 text-primary")}
                >
                  <Bold size={16} />
                </button>
                <button
                  onClick={() => dispatchCanvasAction({ type: 'TOGGLE_FORMAT', payload: 'italic' })}
                  className={cn("flex-1 py-1 rounded flex justify-center hover:bg-muted", textProps.fontStyle === 'italic' && "bg-primary/20 text-primary")}
                >
                  <Italic size={16} />
                </button>
                <button
                  onClick={() => dispatchCanvasAction({ type: 'TOGGLE_FORMAT', payload: 'underline' })}
                  className={cn("flex-1 py-1 rounded flex justify-center hover:bg-muted", textProps.underline && "bg-primary/20 text-primary")}
                >
                  <Underline size={16} />
                </button>
              </div>

              <div className="flex gap-2 bg-background p-1 rounded border border-border">
                <button
                  onClick={() => dispatchCanvasAction({ type: 'SET_TEXT_ALIGN', payload: 'left' })}
                  className={cn("flex-1 py-1 rounded flex justify-center hover:bg-muted", textProps.textAlign === 'left' && "bg-primary/20 text-primary")}
                >
                  <AlignLeft size={16} />
                </button>
                <button
                  onClick={() => dispatchCanvasAction({ type: 'SET_TEXT_ALIGN', payload: 'center' })}
                  className={cn("flex-1 py-1 rounded flex justify-center hover:bg-muted", textProps.textAlign === 'center' && "bg-primary/20 text-primary")}
                >
                  <AlignCenter size={16} />
                </button>
                <button
                  onClick={() => dispatchCanvasAction({ type: 'SET_TEXT_ALIGN', payload: 'right' })}
                  className={cn("flex-1 py-1 rounded flex justify-center hover:bg-muted", textProps.textAlign === 'right' && "bg-primary/20 text-primary")}
                >
                  <AlignRight size={16} />
                </button>
              </div>

              <div className="flex items-center justify-between bg-background border border-border rounded p-1">
                <button
                  onClick={() => dispatchCanvasAction({ type: 'CHANGE_FONT_SIZE', payload: -2 })}
                  className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded"
                >
                  -
                </button>
                <span className="text-sm font-mono w-8 text-center">{textProps.fontSize}</span>
                <button
                  onClick={() => dispatchCanvasAction({ type: 'CHANGE_FONT_SIZE', payload: 2 })}
                  className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded"
                >
                  +
                </button>
              </div>

            </div>
          )}
        </div>
      )}

      {/* Placeholders for other tabs */}
      {['Layouts', 'Sticker', 'Photo Frame', 'Emojis'].includes(activeTab) && (
        <div className="text-sm text-muted-foreground italic">
          {activeTab} options coming soon.
        </div>
      )}
      </div>
    </>
  );
}