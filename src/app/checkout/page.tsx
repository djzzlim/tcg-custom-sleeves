'use client';

import { useStore } from '@/store/useStore';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, CreditCard, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { exportDesignToHighRes } from '@/lib/export';
import {
  orderMeetsPackRequirements,
  designsInPack,
  sleeveCopiesForDesign,
  sleeveCopyCanvasData,
  sleeveCopyPreviewUrl,
  totalSleevesAssigned,
} from '@/lib/packOrder';
import {
  uploadBlobInChunks,
  dataUrlToBlob,
  MAX_OUTPUT_BYTES,
} from '@/lib/chunkedUpload';

const PRICE_PER_SLEEVE = 1.0;

export default function CheckoutPage() {
  const router = useRouter();
  const { packs, sleeves, purchaseId } = useStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [status, setStatus] = useState<'idle' | 'exporting' | 'uploading' | 'success' | 'error'>('idle');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [uploadInfo, setUploadInfo] = useState<{ done: number; total: number; label: string } | null>(null);

  const handleProceedToPayment = async () => {
    if (sleeves.length === 0) return;
    setStatus('exporting');

    try {
      if (!customerName.trim() || !customerEmail.trim()) {
        alert('Please provide your name and email address before proceeding.');
        setStatus('idle');
        return;
      }

      const packCheck = orderMeetsPackRequirements(packs, sleeves);
      if (!packCheck.ok) {
        alert(packCheck.message);
        setStatus('idle');
        return;
      }

      const designPayloads: Array<{
        packName: string;
        packSize: number;
        sleeveType: 'Standard' | 'Japanese';
        name: string;
        uploadId: string;
        mimeType: string;
        size: number;
        quantity: number;
      }> = [];

      const totalDesigns = sleeves.reduce((sum, design) => (
        sum + sleeveCopiesForDesign(design).length
      ), 0);
      let processed = 0;

      for (const pack of packs) {
        const packDesigns = designsInPack(sleeves, pack.id);
        for (const design of packDesigns) {
          const copies = sleeveCopiesForDesign(design);
          for (const [copyIndex, copy] of copies.entries()) {
            processed += 1;
            const copyName = copies.length > 1
              ? `${design.name} - Sleeve ${copyIndex + 1}`
              : design.name;
            const canvasData = sleeveCopyCanvasData(design, copy);
            if (!canvasData) {
              throw new Error(`"${copyName}" in "${pack.name}" is missing artwork.`);
            }
            setUploadInfo({
              done: processed - 1,
              total: totalDesigns,
              label: `Rendering "${copyName}" (${pack.name})`,
            });
            const height = pack.sleeveType === 'Japanese' ? 575 : 560;
            const highResDataUrl = await exportDesignToHighRes(canvasData, {
              height,
              multiplier: 4,
              format: 'png',
            });
            const blob = dataUrlToBlob(highResDataUrl);
            if (blob.size > MAX_OUTPUT_BYTES) {
              throw new Error(
                `"${copyName}" exports to ${(blob.size / 1024 / 1024).toFixed(1)} MB which exceeds the ${MAX_OUTPUT_BYTES / 1024 / 1024} MB output limit. Try simplifying the design.`
              );
            }
            setStatus('uploading');
            setUploadInfo({
              done: processed - 1,
              total: totalDesigns,
              label: `Uploading "${copyName}" (${(blob.size / 1024 / 1024).toFixed(1)} MB)`,
            });
            const filename = `${purchaseId}-${pack.name.replace(/\s+/g, '_')}-${copyName.replace(/\s+/g, '_')}.png`;
            const { uploadId, size } = await uploadBlobInChunks(blob, filename, {
              onProgress: ({ bytesUploaded, totalBytes }) => {
                setUploadInfo({
                  done: processed - 1,
                  total: totalDesigns,
                  label: `Uploading "${copyName}" (${(bytesUploaded / 1024 / 1024).toFixed(1)} / ${(totalBytes / 1024 / 1024).toFixed(1)} MB)`,
                });
              },
            });
            designPayloads.push({
              packName: pack.name,
              packSize: pack.size,
              sleeveType: pack.sleeveType,
              name: copyName,
              uploadId,
              mimeType: 'image/png',
              size,
              quantity: 1,
            });
          }
        }
      }

      setUploadInfo({ done: totalDesigns, total: totalDesigns, label: 'Finalizing order…' });
      setStatus('uploading');
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseId,
          customerName,
          customerEmail,
          designs: designPayloads,
          remarks: 'From Basket Checkout',
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to log order');

      setStatus('success');
      setUploadInfo(null);
      alert('Order designs uploaded successfully! Moving to payment... (Mock)');
    } catch (e: unknown) {
      console.error('Checkout error', e);
      const message = e instanceof Error ? e.message : 'Unknown checkout error';
      setStatus('error');
      setUploadInfo(null);
      alert('Unable to process order: ' + message);
    }
  };

  if (!isMounted) return null;

  const packCheck = orderMeetsPackRequirements(packs, sleeves);
  const totalSleevesCount = sleeves.reduce((acc, s) => acc + (s.quantity ?? 0), 0);
  const subtotal = totalSleevesCount * PRICE_PER_SLEEVE;
  const renderDesignCard = (design: (typeof sleeves)[number]) => (
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
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-mono text-foreground">
              {design.quantity ?? 0}x
            </span>
          </p>
        </div>
        <div className="flex items-center justify-end">
          <span className="font-semibold">
            ${((design.quantity ?? 0) * PRICE_PER_SLEEVE).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );

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
                    </div>
                    <span className="text-sm font-mono text-muted-foreground">
                      ${packSubtotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex flex-col gap-4">
                    {visibleDesigns.map(renderDesignCard)}

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
                            {dropdownDesigns.map(renderDesignCard)}
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

            <div className="flex flex-col gap-4 mb-8">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Customer information
              </h3>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground ml-1">Full Name</label>
                <input
                  type="text"
                  placeholder="John Doe"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground ml-1">Email Address</label>
                <input
                  type="email"
                  placeholder="john@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-primary outline-none transition-all"
                />
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
              className="w-full py-4 bg-primary text-black font-bold uppercase tracking-wider rounded flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
              onClick={handleProceedToPayment}
              disabled={
                status === 'exporting' ||
                status === 'uploading' ||
                sleeves.length === 0 ||
                !packCheck.ok
              }
            >
              {(status === 'exporting' || status === 'uploading') ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <CreditCard size={20} />
              )}

              {(status === 'exporting' || status === 'uploading') ? 'Please wait...' :
               status === 'success' ? 'Order Placed!' :
               status === 'error' ? 'Retry Checkout' :
               'Proceed to Payment'}
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
