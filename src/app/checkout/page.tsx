'use client';

import { useStore } from '@/store/useStore';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, CreditCard, Loader2 } from 'lucide-react';
import DesignQuantityStepper from '@/components/shared/DesignQuantityStepper';
import { useEffect, useRef, useState } from 'react';
import { resolveDesignHighResUpload, designHighResMatchesCanvas } from '@/lib/designS3Upload';
import {
  orderMeetsPackRequirements,
  designsInPack,
  sleeveCopiesForDesign,
  sleeveCopyCanvasData,
  sleeveCopyPreviewUrl,
  totalSleevesAssigned,
  maxQuantityForDesignInPack,
} from '@/lib/packOrder';
import type { Pack, SleeveDesign } from '@/store/useStore';
import { appAlert } from '@/lib/appDialog';
import { cn } from '@/lib/utils';

const PRICE_PER_SLEEVE = 1.0;

export default function CheckoutPage() {
  const router = useRouter();
  const { packs, sleeves, purchaseId, setDesignQuantity } = useStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [status, setStatus] = useState<'idle' | 'exporting' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadInfo, setUploadInfo] = useState<{ done: number; total: number; label: string } | null>(null);
  const isSubmittingRef = useRef(false);

  const isCheckoutLocked =
    status === 'exporting' || status === 'uploading' || status === 'success';

  const handleProceedToPayment = async () => {
    if (isSubmittingRef.current || status === 'success') return;
    if (sleeves.length === 0) return;

    isSubmittingRef.current = true;
    setStatus('exporting');

    try {
      const packCheck = orderMeetsPackRequirements(packs, sleeves);
      if (!packCheck.ok) {
        await appAlert({
          title: 'Order not ready',
          message: packCheck.message,
        });
        isSubmittingRef.current = false;
        setStatus('idle');
        return;
      }

      // 1. Gather all designs to upload
      const uploadTasks: Array<{
        design: SleeveDesign;
        pack: Pack;
        canvasData: string;
      }> = [];

      for (const pack of packs) {
        const packDesigns = designsInPack(sleeves, pack.id);
        for (const design of packDesigns) {
          const copies = sleeveCopiesForDesign(design);
          const canvasData =
            design.canvasData ?? sleeveCopyCanvasData(design, copies[0]);
          if (!canvasData) {
            throw new Error(`"${design.name}" in "${pack.name}" is missing artwork.`);
          }
          uploadTasks.push({ design, pack, canvasData });
        }
      }

      const totalCount = uploadTasks.length;
      let processedCount = 0;

      // Check if all designs are already uploaded
      const allUploaded = uploadTasks.every(({ design, canvasData }) => {
        const freshDesign = useStore.getState().sleeves.find((s) => s.id === design.id) ?? design;
        return designHighResMatchesCanvas(freshDesign, canvasData);
      });

      if (!allUploaded) {
        setStatus('uploading');
        setUploadInfo({
          done: 0,
          total: totalCount,
          label: `Uploading HD designs (0/${totalCount})…`,
        });
      } else {
        setStatus('exporting');
        setUploadInfo(null);
      }

      // 2. Resolve high-res uploads concurrently
      const designPayloads = await Promise.all(
        uploadTasks.map(async ({ design, pack, canvasData }) => {
          const freshDesign =
            useStore.getState().sleeves.find((s) => s.id === design.id) ?? design;

          const highRes = await resolveDesignHighResUpload({
            purchaseId,
            design: freshDesign,
            canvasData,
            sleeveType: pack.sleeveType,
          });

          processedCount += 1;
          if (!allUploaded) {
            setUploadInfo({
              done: processedCount,
              total: totalCount,
              label: `Uploading HD designs (${processedCount}/${totalCount})…`,
            });
          }

          const copies = sleeveCopiesForDesign(design);
          const sleeveQty = design.quantity ?? copies.length;

          return {
            packName: pack.name,
            packSize: pack.size,
            sleeveType: pack.sleeveType,
            name: design.name,
            uploadId: highRes.uploadId,
            mimeType: highRes.mimeType,
            size: highRes.size,
            quantity: sleeveQty,
          };
        })
      );

      setUploadInfo({ done: totalCount, total: totalCount, label: 'Finalizing order…' });
      setStatus('uploading');
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseId,
          designs: designPayloads,
          remarks: 'From Basket Checkout',
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to log order');

      setStatus('success');
      setUploadInfo(null);
      await appAlert({
        title: 'Order uploaded',
        message: 'Your designs were uploaded successfully. Moving to payment… (Mock)',
      });
    } catch (e: unknown) {
      console.error('Checkout error', e);
      const message = e instanceof Error ? e.message : 'Unknown checkout error';
      isSubmittingRef.current = false;
      setStatus('error');
      setUploadInfo(null);
      await appAlert({
        title: 'Checkout failed',
        message: `Unable to process order: ${message}`,
        variant: 'destructive',
      });
    }
  };

  if (!isMounted) return null;

  const packCheck = orderMeetsPackRequirements(packs, sleeves);
  const totalSleevesCount = sleeves.reduce((acc, s) => acc + (s.quantity ?? 0), 0);
  const subtotal = totalSleevesCount * PRICE_PER_SLEEVE;
  const renderDesignCard = (design: SleeveDesign, pack: Pack) => {
    const packDesigns = designsInPack(sleeves, pack.id);
    const qty = design.quantity ?? 0;
    const maxQty = maxQuantityForDesignInPack(packDesigns, design.id, pack.size);

    return (
    <div
      key={design.id}
      className="flex gap-4 p-3 rounded-xl bg-card border border-border"
    >
      <div className="w-24 aspect-[5/7] bg-black rounded shadow border border-white/10 overflow-hidden flex-shrink-0 relative">
        {(() => {
          const previewUrl = sleeveCopyPreviewUrl(design, sleeveCopiesForDesign(design)[0]);
          return previewUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewUrl}
              alt={design.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground text-center p-1.5">
              No Preview
            </div>
          );
        })()}
      </div>
      <div className="flex flex-col justify-between py-1 flex-1 min-w-0">
        <div>
          <h3 className="text-base font-bold text-primary truncate">
            {design.name}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">Sleeves in this pack</p>
        </div>
        <div className="flex flex-col items-end justify-between gap-2 py-1">
          <DesignQuantityStepper
            value={qty}
            max={maxQty}
            onChange={(n) => setDesignQuantity(design.id, n)}
            maxHint={`Max ${maxQty} in this pack`}
          />
          <span className="font-semibold">${(qty * PRICE_PER_SLEEVE).toFixed(2)}</span>
        </div>
      </div>
    </div>
    );
  };

  return (
    <main className="min-h-[100dvh] overflow-y-auto bg-background text-foreground font-sans flex flex-col">
      <header className="h-14 sm:h-16 border-b border-border bg-[#181818] flex items-center px-3 sm:px-6 flex-shrink-0 z-20 sticky top-0">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="font-semibold text-sm">Back</span>
          <span className="hidden sm:inline font-semibold text-sm">to Editor</span>
        </button>
        <div className="flex-1" />
        <span className="text-[11px] sm:text-sm text-muted-foreground font-mono bg-black/20 px-2 sm:px-3 py-1 rounded truncate max-w-[55vw]">
          Order: {purchaseId}
        </span>
      </header>

      <div className="max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row gap-6 lg:gap-12">
        <div className="flex-1 flex flex-col gap-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Your Basket</h1>
            <p className="text-muted-foreground">
              <strong className="text-foreground">{packs.length}</strong> pack
              {packs.length === 1 ? '' : 's'} ·{' '}
              <strong className="text-foreground">{totalSleevesCount}</strong> total sleeves across{' '}
              <strong className="text-foreground">{sleeves.length}</strong> design
              {sleeves.length === 1 ? '' : 's'}.
            </p>
          </div>

          <div className="flex flex-col gap-8">
            {packs.map((pack) => {
              const packDesigns = designsInPack(sleeves, pack.id);
              const shouldUseDropdown = packDesigns.length > 3;
              const visibleDesigns = shouldUseDropdown ? [] : packDesigns;
              const dropdownDesigns = shouldUseDropdown ? packDesigns : [];
              const packAssigned = totalSleevesAssigned(packDesigns);
              const packSubtotal = packAssigned * PRICE_PER_SLEEVE;
              return (
                <section
                  key={pack.id}
                  className="rounded-2xl border border-border bg-black/15 p-4"
                >
                  <div className="mb-4 flex items-baseline justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold">{pack.name}</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {pack.size} sleeves ·{' '}
                        {pack.sleeveType === 'Japanese' ? 'Japanese (62×89mm)' : 'Standard (5:7)'} · Matte
                      </p>
                      <p
                        className={cn(
                          'mt-1 font-mono text-xs tabular-nums',
                          packAssigned === pack.size ? 'text-primary' : 'text-amber-300'
                        )}
                      >
                        {packAssigned}/{pack.size} assigned
                      </p>
                    </div>
                    <span className="text-sm font-mono text-muted-foreground">
                      ${packSubtotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex flex-col gap-4">
                    {visibleDesigns.map((design) => renderDesignCard(design, pack))}

                    {packAssigned !== pack.size && (
                      <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                        This pack has {packAssigned}/{pack.size} sleeves assigned. Adjust quantities so
                        they total {pack.size} before payment.
                      </p>
                    )}

                    {dropdownDesigns.length > 0 && (
                      <details className="group rounded-xl border border-border bg-card/60">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                          <span>
                            {dropdownDesigns.length} design
                            {dropdownDesigns.length === 1 ? '' : 's'}
                          </span>
                          <ChevronDown
                            size={18}
                            className="text-muted-foreground transition-transform group-open:rotate-180"
                          />
                        </summary>
                        <div className="max-h-[360px] overflow-y-auto border-t border-border p-3">
                          <div className="flex flex-col gap-4">
                            {dropdownDesigns.map((design) => renderDesignCard(design, pack))}
                          </div>
                        </div>
                      </details>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <div className="w-full lg:w-[400px]">
          <div className="sticky top-24 bg-card border border-border rounded-xl p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-6">Order Summary</h2>

            <div className="flex flex-col gap-4 text-sm mb-6">
              <div className="flex justify-between text-muted-foreground">
                <span>Packs</span>
                <span className="font-medium text-foreground">{packs.length}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Designs</span>
                <span className="font-medium text-foreground">{sleeves.length}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Total sleeves</span>
                <span className="font-medium text-foreground">{totalSleevesCount}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Price per sleeve</span>
                <span className="font-medium text-foreground">${PRICE_PER_SLEEVE.toFixed(2)}</span>
              </div>
              <div className="border-t border-border pt-4 flex justify-between items-end">
                <span className="text-base font-semibold">Subtotal</span>
                <span className="text-3xl font-bold text-primary">${subtotal.toFixed(2)}</span>
              </div>
            </div>

            {!packCheck.ok && sleeves.length > 0 && (
              <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {packCheck.message}
              </p>
            )}

            {uploadInfo && (
              <div className="mb-3 rounded-lg border border-border bg-black/30 px-3 py-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground truncate">
                  {uploadInfo.label}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${Math.min(100, (uploadInfo.done / Math.max(1, uploadInfo.total)) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums">
                    {uploadInfo.done}/{uploadInfo.total}
                  </span>
                </div>
              </div>
            )}

            <button
              type="button"
              className="w-full py-4 bg-primary text-black font-bold uppercase tracking-wider rounded flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed"
              onClick={handleProceedToPayment}
              disabled={isCheckoutLocked || sleeves.length === 0 || !packCheck.ok}
              aria-disabled={isCheckoutLocked || sleeves.length === 0 || !packCheck.ok}
            >
              {status === 'exporting' || status === 'uploading' ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <CreditCard size={20} />
              )}

              {status === 'exporting' || status === 'uploading'
                ? 'Please wait...'
                : status === 'success'
                  ? 'Order Placed'
                  : status === 'error'
                    ? 'Retry Checkout'
                    : 'Proceed to Payment'}
            </button>

            <p className="text-center text-xs text-muted-foreground mt-4">
              Secure checkout provided by Stripe. Production time is typically 3-5 business days.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
