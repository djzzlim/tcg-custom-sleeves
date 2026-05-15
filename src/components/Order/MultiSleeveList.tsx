'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore, type Pack, type SleeveDesign } from '@/store/useStore';
import { Trash2, Edit2, Plus, Minus, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { appConfirm } from '@/lib/appDialog';
import {
  ORDER_PACK_SIZES,
  type OrderPackSize,
  DEFAULT_ORDER_PACK_SIZE,
  isPackDesignComplete,
  designsInPack,
  totalSleevesAssigned,
  remainingSleevesForPack,
  maxQuantityForDesignInPack,
} from '@/lib/packOrder';

type SleeveCut = 'Standard' | 'Japanese';

export default function MultiSleeveList() {
  const {
    packs,
    sleeves,
    activeSleeveId,
    createPack,
    removePack,
    addDesignToPack,
    setDesignQuantity,
    setActiveSleeve,
    removeSleeve,
    updateSleeve,
  } = useStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Setup form for adding a pack (first pack OR additional pack)
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupSize, setSetupSize] = useState<OrderPackSize>(DEFAULT_ORDER_PACK_SIZE);
  const [setupCut, setSetupCut] = useState<SleeveCut>('Standard');

  // Preview panel — collapsed by default
  const [previewOpen, setPreviewOpen] = useState(false);

  const hasPacks = packs.length > 0;
  const showSetup = !hasPacks || setupOpen;

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId]);

  useEffect(() => {
    if (sleeves.length === 0 && activeSleeveId !== null) {
      useStore.setState({ activeSleeveId: null });
    }
  }, [sleeves.length, activeSleeveId]);

  useEffect(() => {
    if (sleeves.length === 0) return;
    const exists = sleeves.some((s) => s.id === activeSleeveId);
    if (!exists) setActiveSleeve(sleeves[0]!.id);
  }, [sleeves, activeSleeveId, setActiveSleeve]);

  const handleEditStart = (e: React.MouseEvent, id: string, currentName: string) => {
    e.stopPropagation();
    setEditingId(id);
    setEditName(currentName);
  };

  const handleEditSave = (id: string) => {
    if (editName.trim()) {
      updateSleeve(id, { name: editName.trim() });
    }
    setEditingId(null);
  };

  const onConfirmSetup = () => {
    createPack({ size: setupSize, sleeveType: setupCut });
    setSetupOpen(false);
    // Reset form defaults for the next time the user opens it
    setSetupSize(DEFAULT_ORDER_PACK_SIZE);
    setSetupCut('Standard');
  };

  const onRemovePack = async (pack: Pack) => {
    const packDesigns = designsInPack(sleeves, pack.id);
    const designCount = packDesigns.length;
    const ok = await appConfirm({
      title: 'Remove pack?',
      message: `Remove "${pack.name}" and its ${designCount} design${designCount === 1 ? '' : 's'}? This cannot be undone.`,
      variant: 'destructive',
      confirmLabel: 'Remove pack',
    });
    if (!ok) return;
    removePack(pack.id);
  };

  const onRemoveDesign = async (pack: Pack, design: SleeveDesign) => {
    const packDesigns = designsInPack(sleeves, pack.id);
    const isLast = packDesigns.length === 1;
    const message = isLast
      ? `"${design.name}" is the only design in "${pack.name}". Removing it will also remove the pack.`
      : `Remove "${design.name}"? Its ${design.quantity ?? 0} sleeve${(design.quantity ?? 0) === 1 ? '' : 's'} in "${pack.name}" will be unassigned.`;
    const ok = await appConfirm({
      title: isLast ? 'Remove pack?' : 'Remove design?',
      message,
      variant: 'destructive',
      confirmLabel: isLast ? 'Remove pack' : 'Remove',
    });
    if (!ok) return;
    removeSleeve(design.id);
  };

  // One preview tile per design (not per sleeve quantity)
  const previewDesignTiles = packs.flatMap((pack) => {
    const designs = designsInPack(sleeves, pack.id);
    return designs.map((d) => ({
      key: d.id,
      packName: pack.name,
      designName: d.name,
      previewUrl: d.previewUrl,
      designId: d.id,
      quantity: d.quantity ?? 0,
    }));
  });
  const totalAssignedAcrossOrder = packs.reduce(
    (sum, pack) => sum + totalSleevesAssigned(designsInPack(sleeves, pack.id)),
    0
  );
  const totalCapacityAcrossOrder = packs.reduce((s, p) => s + p.size, 0);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
      {/* Existing packs */}
      {hasPacks && (
        <div className="flex flex-col gap-3">
          {packs.map((pack) => {
            const packDesigns = designsInPack(sleeves, pack.id);
            const used = totalSleevesAssigned(packDesigns);
            const remaining = remainingSleevesForPack(packDesigns, pack.size);
            const totalsOk = used === pack.size;

            return (
              <div
                key={pack.id}
                className="rounded-xl border border-border bg-black/20 p-3"
              >
                {/* Pack header */}
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{pack.name}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {pack.size} sleeves ·{' '}
                      {pack.sleeveType === 'Japanese' ? 'Japanese' : 'Standard'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemovePack(pack)}
                    className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Remove this pack"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Progress bar */}
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={cn(
                        'h-full transition-all',
                        totalsOk ? 'bg-primary' : 'bg-amber-400'
                      )}
                      style={{ width: `${Math.min(100, (used / pack.size) * 100)}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      'text-[10px] tabular-nums',
                      totalsOk ? 'text-primary' : 'text-amber-300'
                    )}
                  >
                    {used}/{pack.size}
                  </span>
                </div>
                {!totalsOk && (
                  <p className="-mt-2 mb-2 text-[10px] text-amber-300/90">
                    {remaining > 0
                      ? `${remaining} unassigned — add a design or raise a quantity.`
                      : 'Quantities exceed pack size — lower a quantity.'}
                  </p>
                )}

                {/* Designs in this pack */}
                <div className="flex flex-col gap-2">
                  {packDesigns.map((design) => {
                    const isActive = design.id === activeSleeveId;
                    const qty = design.quantity ?? 0;
                    const max = maxQuantityForDesignInPack(
                      packDesigns,
                      design.id,
                      pack.size
                    );
                    const canInc = qty < max;
                    const canDec = qty > 1;
                    const complete = isPackDesignComplete(design);
                    return (
                      <div
                        key={design.id}
                        onClick={() => setActiveSleeve(design.id)}
                        className={cn(
                          'group cursor-pointer rounded-lg border p-2 transition-colors',
                          isActive
                            ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                            : 'border-border bg-black/30 hover:border-muted-foreground'
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={cn(
                              'relative aspect-[52/72] h-14 shrink-0 overflow-hidden rounded border',
                              complete ? 'border-primary/50' : 'border-border/80'
                            )}
                          >
                            {design.previewUrl ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={design.previewUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center bg-black/55 text-[8px] text-muted-foreground">
                                no photo
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-h-[1.5rem] items-center gap-1">
                              {editingId === design.id ? (
                                <input
                                  ref={inputRef}
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  onBlur={() => handleEditSave(design.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleEditSave(design.id);
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                  className="w-full min-w-0 rounded border border-primary bg-background px-1.5 py-0.5 text-[12px] text-foreground outline-none"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => e.stopPropagation()}
                                  onDoubleClick={(e) => handleEditStart(e, design.id, design.name)}
                                  title="Double-click to rename"
                                  className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold text-foreground"
                                >
                                  {design.name}
                                </button>
                              )}
                              <div className="flex shrink-0 items-center">
                                <button
                                  type="button"
                                  onClick={(e) => handleEditStart(e, design.id, design.name)}
                                  className="rounded p-1 text-muted-foreground hover:bg-white/5 hover:text-primary"
                                  title="Rename design"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoveDesign(pack, design);
                                  }}
                                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                  title="Remove this design"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {complete ? 'Photo ready' : 'Upload a photo for this design'}
                            </p>
                            <div
                              className="mt-1.5 flex items-center gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => setDesignQuantity(design.id, qty - 1)}
                                disabled={!canDec}
                                className={cn(
                                  'flex h-7 w-7 sm:h-6 sm:w-6 items-center justify-center rounded border border-border bg-black/30 text-muted-foreground transition-colors',
                                  canDec
                                    ? 'hover:border-primary hover:text-primary'
                                    : 'cursor-not-allowed opacity-40'
                                )}
                                title="Use one fewer sleeve for this design"
                              >
                                <Minus size={12} />
                              </button>
                              <input
                                type="number"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                min={1}
                                max={max}
                                value={qty}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  if (Number.isFinite(n)) setDesignQuantity(design.id, n);
                                }}
                                className="h-7 w-12 rounded border border-border bg-black/40 px-1 text-center font-mono text-[11px] text-foreground outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none sm:h-6"
                              />
                              <button
                                type="button"
                                onClick={() => setDesignQuantity(design.id, qty + 1)}
                                disabled={!canInc}
                                className={cn(
                                  'flex h-7 w-7 sm:h-6 sm:w-6 items-center justify-center rounded border border-border bg-black/30 text-muted-foreground transition-colors',
                                  canInc
                                    ? 'hover:border-primary hover:text-primary'
                                    : 'cursor-not-allowed opacity-40'
                                )}
                                title={
                                  canInc
                                    ? 'Use one more sleeve for this design'
                                    : 'No spare sleeves — lower another design first'
                                }
                              >
                                <Plus size={12} />
                              </button>
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                / {pack.size}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add design to this pack */}
                <button
                  type="button"
                  onClick={() => addDesignToPack(pack.id)}
                  disabled={remaining === 0}
                  title={
                    remaining === 0
                      ? 'Pack is full — lower a design quantity to add another.'
                      : `Add another design in "${pack.name}" — starts at 1 sleeve; use +/− to split the pack (${remaining} unassigned).`
                  }
                  className={cn(
                    'mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-1.5 text-[11px] font-semibold transition-colors',
                    remaining === 0
                      ? 'cursor-not-allowed border-border text-muted-foreground opacity-50'
                      : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
                  )}
                >
                  <Plus size={12} />
                  Add design{remaining > 0 ? ` (${remaining} left)` : ''}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Setup card — opens for first pack and when adding a new pack */}
      {showSetup && (
        <div className="rounded-xl border border-border bg-black/30 p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {hasPacks ? `Add Pack #${packs.length + 1}` : 'Set up your first pack'}
          </p>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Pick a size and sleeve cut for this pack. Each pack is locked once added.
          </p>

          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pack size
          </p>
          <div className="mb-3 flex gap-2">
            {ORDER_PACK_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setSetupSize(size)}
                className={cn(
                  'flex-1 rounded-lg border py-2 text-sm font-semibold transition-colors',
                  setupSize === size
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
                )}
              >
                {size} sleeves
              </button>
            ))}
          </div>

          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sleeve cut
          </p>
          <div className="mb-3 flex gap-2">
            {(['Standard', 'Japanese'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSetupCut(t)}
                className={cn(
                  'flex-1 rounded-lg border py-2 text-sm font-semibold transition-colors',
                  setupCut === t
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Summary:{' '}
            <span className="text-foreground">
              {setupSize} sleeves · {setupCut}
            </span>
          </p>
          <div className="mt-3 flex gap-2">
            {hasPacks && (
              <button
                type="button"
                onClick={() => setSetupOpen(false)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={onConfirmSetup}
              className="flex-[2] rounded-lg bg-primary py-2 text-xs font-bold uppercase tracking-wider text-black transition hover:brightness-110"
            >
              {hasPacks ? 'Add pack' : 'Start designing'}
            </button>
          </div>
        </div>
      )}

      {/* Add another pack trigger */}
      {hasPacks && !setupOpen && (
        <button
          type="button"
          onClick={() => setSetupOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus size={14} />
          Add another pack
        </button>
      )}

      {/* Preview */}
      {hasPacks && (
        <div className="rounded-lg border border-border/80 bg-black/30 p-2">
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            aria-expanded={previewOpen}
            aria-controls="preview-grid"
            className="flex w-full items-center justify-between gap-2 rounded text-left hover:bg-white/[0.03] transition-colors px-1 py-0.5"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Preview
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {totalAssignedAcrossOrder}/{totalCapacityAcrossOrder} sleeves
              </span>
              <ChevronDown
                size={14}
                className={cn(
                  'text-muted-foreground transition-transform',
                  previewOpen ? 'rotate-180' : 'rotate-0'
                )}
              />
            </span>
          </button>
          {previewOpen && (
            <div id="preview-grid" className="mt-2">
              <p className="mb-2 text-[10px] leading-snug text-muted-foreground/90">
                One tile per design — tap to edit. Sleeve count is set with +/− on each design.
              </p>
              <div
                className={cn(
                  'max-h-52 overflow-y-auto overscroll-contain rounded-md border border-white/[0.06] bg-black/25 p-1.5',
                  '[scrollbar-width:thin]'
                )}
              >
                <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-4">
                  {previewDesignTiles.map((tile) => (
                    <button
                      key={tile.key}
                      type="button"
                      onClick={() => setActiveSleeve(tile.designId)}
                      title={
                        tile.quantity > 1
                          ? `${tile.packName} · ${tile.designName} · ${tile.quantity} sleeves`
                          : `${tile.packName} · ${tile.designName}`
                      }
                      className={cn(
                        'relative aspect-[52/72] overflow-hidden rounded border',
                        tile.designId === activeSleeveId
                          ? 'border-primary ring-1 ring-primary/40'
                          : tile.previewUrl
                            ? 'border-primary/40'
                            : 'border-border/80'
                      )}
                    >
                      {tile.previewUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={tile.previewUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-black/55 text-[7px] text-muted-foreground">
                          —
                        </span>
                      )}
                      {tile.quantity > 1 && (
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 py-px font-mono text-[8px] text-primary">
                          ×{tile.quantity}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
