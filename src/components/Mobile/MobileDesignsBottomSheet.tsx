'use client';

import { useRef } from 'react';
import { useStore, type Pack, type SleeveDesign } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { Plus, ChevronUp, ChevronDown, X } from 'lucide-react';
import DesignQuantityStepper from '@/components/shared/DesignQuantityStepper';
import { setDesignQuantityWithSave } from '@/lib/designQuantity';
import { appConfirm } from '@/lib/appDialog';
import {
  designsInPack,
  remainingSleevesForPack,
  maxQuantityForDesignInPack,
  totalSleevesAssigned,
} from '@/lib/packOrder';

export default function MobileDesignsBottomSheet() {
  const {
    packs,
    sleeves,
    activeSleeveId,
    activeTab,
    addDesignToPack,
    removeSleeve,
    setActiveSleeve,
    mobileDesignsSheetExpanded,
    setMobileDesignsSheetExpanded,
    setMobileAddPackOpen,
  } = useStore();

  const touchStartY = useRef<number | null>(null);

  const activeDesign = sleeves.find((s) => s.id === activeSleeveId);
  const pack = activeDesign
    ? packs.find((p) => p.id === activeDesign.packId)
    : packs[0];

  if (!pack || activeTab !== 'Photos') return null;

  const packDesigns = designsInPack(sleeves, pack.id);
  const remaining = remainingSleevesForPack(packDesigns, pack.size);
  const canAddDesign = remaining >= 1;

  const handleToggleExpand = () => {
    setMobileDesignsSheetExpanded(!mobileDesignsSheetExpanded);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartY.current;
    touchStartY.current = null;
    if (start == null) return;
    const endY = e.changedTouches[0]?.clientY ?? start;
    const delta = endY - start;
    if (delta > 40) setMobileDesignsSheetExpanded(false);
    if (delta < -40) setMobileDesignsSheetExpanded(true);
  };

  const activeQty = activeDesign?.quantity ?? 0;
  const activeMax = activeDesign
    ? maxQuantityForDesignInPack(packDesigns, activeDesign.id, pack.size)
    : 1;

  const onRemoveDesign = async (targetPack: Pack, design: SleeveDesign) => {
    const targetDesigns = designsInPack(sleeves, targetPack.id);
    const isLast = targetDesigns.length === 1;
    const ok = await appConfirm({
      title: isLast ? 'Remove pack?' : 'Remove design?',
      message: isLast
        ? `"${design.name}" is the only design in "${targetPack.name}". Removing it will also remove the pack.`
        : `Remove "${design.name}"? Its ${design.quantity ?? 0} sleeve${(design.quantity ?? 0) === 1 ? '' : 's'} in "${targetPack.name}" will be unassigned.`,
      variant: 'destructive',
      confirmLabel: isLast ? 'Remove pack' : 'Remove',
    });
    if (!ok) return;
    removeSleeve(design.id);
  };

  return (
    <div
      className="shrink-0 overflow-hidden border-t border-border bg-[#1e1e1e] transition-[max-height] duration-200 ease-out lg:hidden flex flex-col"
      style={{ maxHeight: mobileDesignsSheetExpanded ? 'min(45vh, 320px)' : '2.75rem' }}
    >
      <button
        type="button"
        onClick={handleToggleExpand}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="shrink-0 flex w-full items-center justify-center gap-2 py-2.5"
        aria-expanded={mobileDesignsSheetExpanded}
      >
        <span className="block h-1 w-10 rounded-full bg-white/25" aria-hidden />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Designs
        </span>
        {mobileDesignsSheetExpanded ? (
          <ChevronDown size={14} className="text-muted-foreground" />
        ) : (
          <ChevronUp size={14} className="text-muted-foreground" />
        )}
      </button>

      {mobileDesignsSheetExpanded && (
        <div className="overflow-y-auto px-2 pb-6 flex-1 min-h-0 [scrollbar-width:thin]">
          {packs.length > 1 && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
              {packs.map((p) => {
                const pDesigns = designsInPack(sleeves, p.id);
                const assigned = totalSleevesAssigned(pDesigns);
                const isActivePack = p.id === pack.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      const first = pDesigns[0];
                      if (first) setActiveSleeve(first.id);
                    }}
                    className={cn(
                      'shrink-0 rounded-lg border px-2.5 py-1.5 text-left transition-colors',
                      isActivePack
                        ? 'border-primary bg-primary/10'
                        : 'border-border text-muted-foreground'
                    )}
                  >
                    <span className="block text-[10px] font-bold text-foreground">{p.name}</span>
                    <span className="block text-[9px] tabular-nums">
                      {assigned}/{p.size} · {p.sleeveType === 'Japanese' ? 'JP' : 'Std'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]">
            {packDesigns.map((design) => {
              const qty = design.quantity ?? 0;
              const isActive = design.id === activeSleeveId;
              return (
                <div
                  key={design.id}
                  className={cn(
                    'relative shrink-0 w-[4.5rem] overflow-hidden rounded-lg border aspect-[52/72]',
                    isActive
                      ? 'border-primary ring-2 ring-primary/40'
                      : design.previewUrl
                        ? 'border-primary/35'
                        : 'border-border'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setActiveSleeve(design.id)}
                    className="h-full w-full"
                    aria-label={`Select ${design.name}`}
                  >
                    {design.previewUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={design.previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-black/50 text-[8px] text-muted-foreground">
                        —
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/75 px-1 py-0.5 text-[8px] font-semibold text-foreground">
                      {design.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onRemoveDesign(pack, design);
                    }}
                    className="absolute left-0.5 top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-white/90 shadow-sm transition-colors hover:bg-destructive hover:text-white"
                    aria-label={`Remove ${design.name}`}
                  >
                    <X size={10} strokeWidth={2.5} />
                  </button>
                  {qty > 1 && (
                    <span className="absolute right-0.5 top-0.5 rounded bg-primary px-1 py-px font-mono text-[8px] font-bold text-black">
                      ×{qty}
                    </span>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              disabled={!canAddDesign}
              onClick={() => canAddDesign && addDesignToPack(pack.id)}
              title={
                canAddDesign
                  ? 'Add another design'
                  : 'Pack is full — lower a design quantity first'
              }
              className={cn(
                'flex shrink-0 w-[4.5rem] flex-col items-center justify-center gap-1 rounded-lg border border-dashed aspect-[52/72]',
                canAddDesign
                  ? 'border-border text-muted-foreground hover:border-primary hover:text-primary'
                  : 'cursor-not-allowed border-border/50 opacity-40'
              )}
            >
              <Plus size={18} />
              <span className="text-[8px] font-semibold leading-tight text-center px-1">
                Add design
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMobileAddPackOpen(true)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus size={14} />
            Add another pack
          </button>

          {activeDesign && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2">
              <span className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">{activeDesign.name}</span>
                {' · '}sleeves for this design
              </span>
              <DesignQuantityStepper
                size="sm"
                value={activeQty}
                max={activeMax}
                onChange={(n) => setDesignQuantityWithSave(activeDesign.id, n)}
                maxHint={`Max ${activeMax} for this design`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
