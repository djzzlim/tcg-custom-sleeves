'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import {
  ORDER_PACK_SIZES,
  DEFAULT_ORDER_PACK_SIZE,
  type OrderPackSize,
} from '@/lib/packOrder';

type SleeveCut = 'Standard' | 'Japanese';

type Props = {
  onStarted?: () => void;
};

export default function MobilePackSetupSheet({ onStarted }: Props) {
  const { packs, createPack, mobileAddPackOpen, setMobileAddPackOpen } = useStore();
  const [setupSize, setSetupSize] = useState<OrderPackSize>(DEFAULT_ORDER_PACK_SIZE);
  const [setupCut, setSetupCut] = useState<SleeveCut>('Standard');

  const isFirstPack = packs.length === 0;
  const isOpen = isFirstPack || mobileAddPackOpen;

  if (!isOpen) return null;

  const resetForm = () => {
    setSetupSize(DEFAULT_ORDER_PACK_SIZE);
    setSetupCut('Standard');
  };

  const handleConfirm = () => {
    createPack({ size: setupSize, sleeveType: setupCut });
    if (!isFirstPack) {
      setMobileAddPackOpen(false);
      resetForm();
    }
    onStarted?.();
  };

  const handleCancel = () => {
    setMobileAddPackOpen(false);
    resetForm();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[2px] lg:hidden"
        aria-hidden
        onClick={isFirstPack ? undefined : handleCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-pack-setup-title"
        className="fixed inset-x-0 bottom-0 z-[61] rounded-t-2xl border-t border-border bg-[#1e1e1e] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl lg:hidden"
      >
        <div className="mb-4 flex justify-center">
          <span className="block h-1 w-10 rounded-full bg-white/20" aria-hidden />
        </div>
        <h2
          id="mobile-pack-setup-title"
          className="text-lg font-bold text-foreground"
        >
          {isFirstPack ? 'Set up your pack' : `Add Pack #${packs.length + 1}`}
        </h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Pick a size and sleeve cut for this pack. Each pack is locked once added.
        </p>

        <p className="mt-4 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Pack size
        </p>
        <div className="mb-3 flex gap-2">
          {ORDER_PACK_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setSetupSize(size)}
              className={cn(
                'flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors sm:text-sm sm:py-2.5',
                setupSize === size
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground'
              )}
            >
              {size} sleeves
            </button>
          ))}
        </div>

        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sleeve cut
        </p>
        <div className="mb-4 flex gap-2">
          {(['Standard', 'Japanese'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSetupCut(t)}
              className={cn(
                'flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors sm:text-sm sm:py-2.5',
                setupCut === t
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <p className="mb-4 text-[11px] text-muted-foreground">
          Summary:{' '}
          <span className="text-foreground">
            {setupSize} sleeves · {setupCut}
          </span>
        </p>

        <div className={cn('flex gap-2', !isFirstPack && 'flex-row')}>
          {!isFirstPack && (
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 rounded-lg border border-border py-3.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            className={cn(
              'rounded-lg bg-primary py-3.5 text-sm font-bold uppercase tracking-wider text-black hover:brightness-110',
              isFirstPack ? 'w-full' : 'flex-[2]'
            )}
          >
            {isFirstPack ? 'Start design' : 'Add pack'}
          </button>
        </div>
      </div>
    </>
  );
}
