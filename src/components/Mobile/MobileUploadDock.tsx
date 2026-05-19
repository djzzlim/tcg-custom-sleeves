'use client';

import { useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { useStore } from '@/store/useStore';
import { dispatchCanvasAction } from '@/lib/events';
import { Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  designHasUserPhoto,
  shouldBlockNextImageUpload,
  totalOrderSleeves,
} from '@/lib/packOrder';
import { INPUT_ACCEPT, validateUploadedImage } from '@/lib/imageValidation';

export type MobileUploadDockHandle = {
  focusUpload: () => void;
};

const MobileUploadDock = forwardRef<MobileUploadDockHandle>(function MobileUploadDock(_, ref) {
  const {
    packs,
    sleeves,
    activeSleeveId,
    sessionImageUploadCount,
    activeTab,
  } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const activeDesign = sleeves.find((s) => s.id === activeSleeveId);
  const hasPack = packs.length > 0;
  const replacingPhoto = designHasUserPhoto(activeDesign);
  const canUploadImage =
    hasPack && (replacingPhoto || !shouldBlockNextImageUpload(packs, sessionImageUploadCount));

  useImperativeHandle(ref, () => ({
    focusUpload: () => {
      buttonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      buttonRef.current?.focus();
    },
  }));

  if (!hasPack || !activeSleeveId || activeTab !== 'Photos') return null;

  const label = replacingPhoto ? 'Replace image' : 'Upload image';

  return (
    <div className="shrink-0 border-t border-border bg-[#1a1a1a] px-3 py-2 lg:hidden">
      {uploadError && (
        <p
          role="alert"
          className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive"
        >
          {uploadError}
        </p>
      )}
      <button
        ref={buttonRef}
        type="button"
        disabled={!canUploadImage}
        onClick={() => {
          if (!canUploadImage) return;
          fileInputRef.current?.click();
        }}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold uppercase tracking-wider transition-all',
          canUploadImage
            ? 'bg-primary text-black hover:brightness-110'
            : 'cursor-not-allowed bg-muted text-muted-foreground opacity-60'
        )}
      >
        <Camera size={20} strokeWidth={2.25} />
        {label}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={INPUT_ACCEPT}
        className="hidden"
        disabled={!canUploadImage}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setUploadError(null);
          const { packs: ps, sleeves: ss, activeSleeveId: aid, sessionImageUploadCount: uploads } =
            useStore.getState();
          const design = ss.find((s) => s.id === aid);
          const isReplace = designHasUserPhoto(design);
          if (!isReplace && shouldBlockNextImageUpload(ps, uploads)) {
            setUploadError('Upload limit reached for this session.');
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
    </div>
  );
});

export default MobileUploadDock;
