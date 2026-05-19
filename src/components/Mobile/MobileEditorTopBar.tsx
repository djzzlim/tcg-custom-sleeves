'use client';

import { useStore, type Pack } from '@/store/useStore';
import { designsInPack, totalSleevesAssigned } from '@/lib/packOrder';
import { appConfirm } from '@/lib/appDialog';
import { Trash2 } from 'lucide-react';

export default function MobileEditorTopBar() {
  const { packs, sleeves, activeSleeveId, removePack } = useStore();

  const activeDesign = sleeves.find((s) => s.id === activeSleeveId);
  const pack = activeDesign
    ? packs.find((p) => p.id === activeDesign.packId)
    : packs[0];

  if (!pack) return null;

  const packDesigns = designsInPack(sleeves, pack.id);
  const assigned = totalSleevesAssigned(packDesigns);

  const onRemovePack = async (target: Pack) => {
    const designs = designsInPack(sleeves, target.id);
    const ok = await appConfirm({
      title: 'Remove pack?',
      message: `Remove "${target.name}" and its ${designs.length} design${designs.length === 1 ? '' : 's'}? You can set up a new pack (e.g. 110 sleeves) afterward.`,
      variant: 'destructive',
      confirmLabel: 'Remove pack',
    });
    if (!ok) return;
    removePack(target.id);
  };

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-[#181818] px-3 py-2 lg:hidden">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{pack.name}</p>
        <p className="text-[10px] text-muted-foreground">
          {pack.sleeveType === 'Japanese' ? 'Japanese' : 'Standard'} · {pack.size} cap
        </p>
      </div>
      <p className="shrink-0 text-xs font-mono tabular-nums text-primary">
        {assigned}/{pack.size}
      </p>
      <button
        type="button"
        onClick={() => onRemovePack(pack)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        title="Remove this pack"
        aria-label="Remove this pack"
      >
        <Trash2 size={17} />
      </button>
    </div>
  );
}
