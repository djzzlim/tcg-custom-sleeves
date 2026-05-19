'use client';

import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { designsInPack, totalSleevesAssigned } from '@/lib/packOrder';

type Props = {
  /** panel = desktop-style copy; compact = medium; strip = mobile dock (no headers) */
  variant?: 'panel' | 'compact' | 'strip';
};

export default function MobileDesignPreviewGrid({ variant = 'panel' }: Props) {
  const { packs, sleeves, activeSleeveId, setActiveSleeve } = useStore();

  if (packs.length === 0) {
    return (
      <p className="px-2 py-2 text-sm text-muted-foreground">Create a pack to see design previews.</p>
    );
  }

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

  const tileClass =
    variant === 'panel' ? 'w-[5.5rem]' : variant === 'strip' ? 'w-[3.25rem]' : 'w-[4.5rem]';

  const renderTile = (tile: (typeof previewDesignTiles)[number]) => {
    const isActive = tile.designId === activeSleeveId;
    return (
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
          'relative shrink-0 overflow-hidden border aspect-[52/72]',
          variant === 'strip' ? 'rounded-md' : 'rounded-lg',
          tileClass,
          isActive
            ? variant === 'strip'
              ? 'border-primary ring-1 ring-primary/40'
              : 'border-primary ring-2 ring-primary/40'
            : tile.previewUrl
              ? 'border-primary/35'
              : 'border-border'
        )}
      >
        {tile.previewUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={tile.previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span
            className={cn(
              'flex h-full w-full items-center justify-center bg-black/50 text-muted-foreground',
              variant === 'strip' ? 'text-[8px]' : 'text-[9px]'
            )}
          >
            {variant === 'strip' ? '—' : 'No photo'}
          </span>
        )}
        {variant !== 'strip' && (
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/80 px-1 py-0.5 text-[8px] font-semibold text-foreground">
            {tile.packName} · {tile.designName}
          </span>
        )}
        {tile.quantity > 1 && (
          <span
            className={cn(
              'absolute rounded bg-primary font-mono font-bold text-black',
              variant === 'strip'
                ? 'bottom-0.5 right-0.5 bg-black/75 px-1 py-px text-[8px] text-primary'
                : 'right-0.5 top-0.5 px-0.5 text-[7px]'
            )}
          >
            ×{tile.quantity}
          </span>
        )}
      </button>
    );
  };

  if (variant === 'strip') {
    return (
      <div className="flex flex-col gap-1 py-2">
        <p className="px-2 text-[9px] text-muted-foreground">
          All packs · {previewDesignTiles.length} design{previewDesignTiles.length === 1 ? '' : 's'} ·{' '}
          <span className="font-mono text-primary">
            {totalAssignedAcrossOrder}/{totalCapacityAcrossOrder}
          </span>{' '}
          sleeves
        </p>
        <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain px-2 [scrollbar-width:thin]">
          {previewDesignTiles.map(renderTile)}
          {previewDesignTiles.length === 0 && (
            <p className="py-2 text-[10px] text-muted-foreground">No designs yet.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">All packs</span>
          {' · '}
          {previewDesignTiles.length} design{previewDesignTiles.length === 1 ? '' : 's'}
        </p>
        <span className="shrink-0 font-mono text-[11px] text-primary">
          {totalAssignedAcrossOrder} / {totalCapacityAcrossOrder}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        One tile per design across every pack. Tap to switch the canvas.
      </p>
      <div className="flex gap-2.5 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]">
        {previewDesignTiles.map(renderTile)}
        {previewDesignTiles.length === 0 && (
          <p className="py-4 text-[11px] text-muted-foreground">No designs yet.</p>
        )}
      </div>
    </div>
  );
}
