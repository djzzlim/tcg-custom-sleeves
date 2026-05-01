'use client';

import { useStore } from '@/store/useStore';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Minus, Plus, CreditCard } from 'lucide-react';
import { useEffect, useState } from 'react';
import { exportDesignToHighRes } from '@/lib/export';

const PRICE_PER_SLEEVE = 0.50;

export default function CheckoutPage() {
  const router = useRouter();
  const { sleeves, updateSleeve, purchaseId } = useStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // early return moved after hooks

  // Payment processing state and handler
  const [status, setStatus] = useState<'idle' | 'exporting' | 'uploading' | 'success' | 'error'>('idle');

  const handleProceedToPayment = async () => {
    if (sleeves.length === 0) return;
    setStatus('exporting');
    
    try {
      // 0. Pre-check for empty designs
      const emptyDesignIndex = sleeves.findIndex(s => !s.canvasData);
      if (emptyDesignIndex !== -1) {
        const designName = sleeves[emptyDesignIndex].name || `Design #${emptyDesignIndex + 1}`;
        alert(`Your design "${designName}" is empty. Please go back and add some images or text before checking out!`);
        setStatus('idle');
        return;
      }

      // 1. Export High-Res Images
      const designPayloads = await Promise.all(
        sleeves.map(async (sleeve, index) => {
          const height = sleeve.sleeveType === 'Japanese' ? 575 : 560;
          const highResDataUrl = await exportDesignToHighRes(sleeve.canvasData!, height, 4);
          return {
            name: sleeve.name || `Design ${index + 1}`,
            dataUrl: highResDataUrl
          };
        })
      );

      // 2. Upload to Server (Drive & Sheets)
      setStatus('uploading');
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseId,
          designs: designPayloads,
          remarks: "From Basket Checkout"
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to log order');

      // 3. Mock Redirect / Success
      setStatus('success');
      alert('Order designs uploaded successfully! Moving to payment... (Mock)');
      
      // If there was a real payment URL from /api/checkout, we'd go there now
      // router.push('/success');
      
    } catch (e: any) {
      console.error('Checkout error', e);
      setStatus('error');
      alert('Unable to process order: ' + e.message);
    }
  };
  if (!isMounted) return null;

  const totalSleeves = sleeves.reduce((acc, s) => acc + (s.quantity || 10), 0);
  const subtotal = totalSleeves * PRICE_PER_SLEEVE;

  return (
    <main className="h-screen overflow-y-auto bg-background text-foreground font-sans flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-border bg-[#181818] flex items-center px-6 flex-shrink-0 z-20 sticky top-0">
        <button 
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="font-semibold text-sm">Back to Editor</span>
        </button>
        <div className="flex-1" />
        <span className="text-sm text-muted-foreground font-mono bg-black/20 px-3 py-1 rounded">
          Order: {purchaseId}
        </span>
      </header>

      {/* Content */}
      <div className="max-w-6xl w-full mx-auto p-8 flex flex-col lg:flex-row gap-12">
        
        {/* Left Column - Items */}
        <div className="flex-1 flex flex-col gap-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Your Basket</h1>
            <p className="text-muted-foreground">Review your custom sleeve designs before production.</p>
          </div>

          <div className="flex flex-col gap-6">
            {sleeves.map((sleeve) => {
              const qty = sleeve.quantity || 10;
              return (
                <div key={sleeve.id} className="flex gap-6 p-4 rounded-xl bg-card border border-border shadow-sm">
                  {/* Preview Image */}
                  <div className="w-32 aspect-[5/7] bg-black rounded shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-white/10 overflow-hidden flex-shrink-0 relative">
                    {sleeve.previewUrl ? (
                      <img src={sleeve.previewUrl} alt={sleeve.name} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground text-center p-2">
                        No Preview
                      </div>
                    )}
                  </div>
                  
                  {/* Details & Controls */}
                  <div className="flex flex-col justify-between py-2 flex-1">
                    <div>
                      <h3 className="text-xl font-bold text-primary">{sleeve.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {sleeve.sleeveType === 'Japanese' ? 'Japanese Size (62x89mm)' : 'Standard Size (5:7 Ratio)'} • Matte Finish
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 bg-background border border-border rounded-full p-1">
                        <button 
                          onClick={() => updateSleeve(sleeve.id, { quantity: Math.max(10, qty - 1) })}
                          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="font-mono font-semibold w-8 text-center">{qty}</span>
                        <button 
                          onClick={() => updateSleeve(sleeve.id, { quantity: qty + 1 })}
                          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      
                      <span className="font-bold text-lg">
                        ${(qty * PRICE_PER_SLEEVE).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column - Summary */}
        <div className="w-full lg:w-[400px]">
          <div className="sticky top-24 bg-card border border-border rounded-xl p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-6">Order Summary</h2>
            
            <div className="flex flex-col gap-4 text-sm mb-6">
              <div className="flex justify-between text-muted-foreground">
                <span>Total Designs</span>
                <span className="font-medium text-foreground">{sleeves.length}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Total Sleeves</span>
                <span className="font-medium text-foreground">{totalSleeves}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Price per Sleeve</span>
                <span className="font-medium text-foreground">${PRICE_PER_SLEEVE.toFixed(2)}</span>
              </div>
              <div className="border-t border-border pt-4 flex justify-between items-end">
                <span className="text-base font-semibold">Subtotal</span>
                <span className="text-3xl font-bold text-primary">${subtotal.toFixed(2)}</span>
              </div>
            </div>

            <button 
              className="w-full py-4 bg-primary text-black font-bold uppercase tracking-wider rounded flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
              onClick={handleProceedToPayment}
              disabled={status === 'exporting' || status === 'uploading' || sleeves.length === 0}
            >
              <CreditCard size={20} />
              {status === 'exporting' && 'Generating High-Res...'}
              {status === 'uploading' && 'Saving to Drive...'}
              {status === 'idle' && 'Proceed to Payment'}
              {status === 'success' && 'Order Placed!'}
              {status === 'error' && 'Retry Checkout'}
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
