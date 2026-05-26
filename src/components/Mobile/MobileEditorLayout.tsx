'use client';

import { useRef } from 'react';
import { useStore } from '@/store/useStore';
import CanvasEditor from '@/components/Editor/CanvasEditor';
import EditorSidebar from '@/components/Editor/EditorSidebar';
import MobileEditorToolDock from '@/components/Mobile/MobileEditorToolDock';
import MobilePackSetupSheet from '@/components/Mobile/MobilePackSetupSheet';
import MobileEditorTopBar from '@/components/Mobile/MobileEditorTopBar';
import MobileUploadDock, { type MobileUploadDockHandle } from '@/components/Mobile/MobileUploadDock';
import MobileDesignsBottomSheet from '@/components/Mobile/MobileDesignsBottomSheet';

export default function MobileEditorLayout() {
  const { packs, activeSleeveId, setMobileDesignsSheetExpanded, setActiveTab } = useStore();
  const uploadDockRef = useRef<MobileUploadDockHandle>(null);

  const handlePackStarted = () => {
    setActiveTab('Photos');
    setMobileDesignsSheetExpanded(true);
    window.setTimeout(() => {
      uploadDockRef.current?.focusUpload();
    }, 350);
  };

  return (
    <>
      <MobilePackSetupSheet onStarted={handlePackStarted} />

      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        {packs.length > 0 && <MobileEditorTopBar />}

        <section className="relative min-h-0 flex-1 overflow-hidden bg-[#2b2b2b]">
          {activeSleeveId ? (
            <CanvasEditor isMobileView={true} />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {packs.length === 0 ? (
                <p>Set up your pack to start designing.</p>
              ) : (
                <p className="italic">Open Photos to pick a design and upload.</p>
              )}
            </div>
          )}
        </section>

        <MobileEditorToolDock />
        <MobileUploadDock ref={uploadDockRef} />
        <MobileDesignsBottomSheet />
      </div>

      <div className="contents lg:hidden">
        <EditorSidebar />
      </div>
    </>
  );
}
