'use client';

import { useStore } from '@/store/useStore';
import { useState } from 'react';
import { ShoppingCart, CheckCircle2, Loader2 } from 'lucide-react';
import { exportDesignToHighRes } from '@/lib/export';

export default function OrderForm() {
  const { purchaseId, remarks, setRemarks, sleeves } = useStore();
  const [status, setStatus] = useState<'idle' | 'exporting' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async () => {
    if (sleeves.length === 0) return;
    
    try {
      // 1. Export High-Res Images
      setStatus('exporting');
      const designPayloads = await Promise.all(
        sleeves.map(async (sleeve, index) => {
          if (!sleeve.canvasData) {
            throw new Error(`Design ${index + 1} is empty`);
          }
          const highResDataUrl = await exportDesignToHighRes(sleeve.canvasData, 4); // 4x resolution
          return {
            name: sleeve.name || `Design ${index + 1}`,
            dataUrl: highResDataUrl
          };
        })
      );

      // 2. Upload to Server (which uploads to Drive and logs to Sheets)
      setStatus('uploading');
      const response = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseId,
          remarks,
          designs: designPayloads,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to submit order');
      }

      setStatus('success');
    } catch (error: any) {
      console.error('Order submission error:', error);
      setErrorMessage(error.message || 'An unexpected error occurred');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
        <CheckCircle2 size={48} className="text-green-500" />
        <h3 className="text-lg font-bold">Order Submitted!</h3>
        <p className="text-sm text-muted-foreground px-4">
          Thank you! Your designs have been saved and logged. <br />
          Purchase ID: <strong>{purchaseId}</strong>.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="text-sm text-primary underline"
        >
          Start New Order
        </button>
      </div>
    );
  }

  const isSubmitting = status === 'exporting' || status === 'uploading';

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Remarks
        </label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Special instructions for printing (e.g., gloss finish, quantity per design)..."
          className="w-full h-32 bg-background border border-border rounded-md p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      {status === 'error' && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-xs">
          {errorMessage}
        </div>
      )}

      <div className="pt-4 border-t border-border">
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm font-medium">Total Items:</span>
          <span className="text-sm font-bold font-mono">{sleeves.length} Designs</span>
        </div>
        
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || sleeves.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-md font-bold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'exporting' && (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Generating High-Res...</span>
            </>
          )}
          {status === 'uploading' && (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Saving to Drive...</span>
            </>
          )}
          {status === 'idle' || status === 'error' ? (
            <>
              <ShoppingCart size={18} />
              <span>Submit Order</span>
            </>
          ) : null}
        </button>
      </div>
      
      <p className="text-[10px] text-muted-foreground text-center">
        Processing may take a few seconds for high-resolution images.
      </p>
    </div>
  );
}
