'use client';

import { useStore } from '@/store/useStore';
import { useState } from 'react';
import { ShoppingCart, CheckCircle2 } from 'lucide-react';

export default function OrderForm() {
  const { purchaseId, remarks, setRemarks, sleeves } = useStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    // Simulate API call to Google Sheets
    // In a real app, this would be a POST to /api/order
    try {
      console.log('Submitting Order:', {
        purchaseId,
        remarks,
        sleevesCount: sleeves.length,
        sleeves: sleeves.map(s => ({ id: s.id, name: s.name, design: s.canvasData?.substring(0, 100) + '...' }))
      });
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsSuccess(true);
    } catch (error) {
      console.error('Failed to submit order', error);
      alert('Failed to submit order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
        <CheckCircle2 size={48} className="text-green-500" />
        <h3 className="text-lg font-bold">Order Submitted!</h3>
        <p className="text-sm text-muted-foreground px-4">
          Thank you! Your Purchase ID is <strong>{purchaseId}</strong>. We will process your custom sleeves shortly.
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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Remarks
        </label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Special instructions for printing..."
          className="w-full h-32 bg-background border border-border rounded-md p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

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
          {isSubmitting ? (
            <div className="h-5 w-5 border-2 border-primary-foreground border-t-transparent animate-spin rounded-full" />
          ) : (
            <>
              <ShoppingCart size={18} />
              <span>Submit Order</span>
            </>
          )}
        </button>
      </div>
      
      <p className="text-[10px] text-muted-foreground text-center">
        By submitting, you agree that you own the copyright to all uploaded images.
      </p>
    </div>
  );
}
