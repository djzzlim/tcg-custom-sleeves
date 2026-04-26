'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import CanvasEditor from '@/components/Editor/CanvasEditor';
import Mockup3D from '@/components/Preview/Mockup3D';
import MultiSleeveList from '@/components/Order/MultiSleeveList';
import EditorSidebar from '@/components/Editor/EditorSidebar';
import EditorSubPanel from '@/components/Editor/EditorSubPanel';

import { ShoppingCart } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const { 
    purchaseId, 
    generatePurchaseId, 
    sleeves, 
    addSleeve, 
    activeSleeveId 
  } = useStore();
  
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  useEffect(() => {
    if (!purchaseId) {
      generatePurchaseId();
    }
    if (sleeves.length === 0) {
      addSleeve();
    }
  }, [purchaseId, generatePurchaseId, sleeves.length, addSleeve]);

  const handleCheckout = () => {
    // Use client-side routing to preserve Zustand state
    router.push('/checkout');
  };

  return (
    <main className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden font-sans">
      {/* Top Header */}
      <header className="h-16 border-b border-border bg-[#181818] flex justify-between items-center px-6 flex-shrink-0 z-20">
        <div className="flex items-center">
          <img 
            src="/logo.jpeg" 
            alt="Client Logo" 
            className="h-12 w-auto object-contain invert mix-blend-screen opacity-90"
          />
        </div>
        
        <div className="flex items-center gap-6">
          <span className="text-sm text-muted-foreground font-mono">
            ID: {purchaseId}
          </span>
          <button 
            onClick={handleCheckout}
            disabled={isCheckingOut}
            className="px-6 py-2.5 rounded bg-primary text-black font-bold uppercase tracking-wider text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <ShoppingCart size={18} strokeWidth={2.5} />
            {isCheckingOut ? 'Processing...' : 'Add to Basket'}
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebars */}
        <div className="flex h-full flex-shrink-0">
          <EditorSidebar />
          <EditorSubPanel />
        </div>

        {/* Center Canvas */}
        <section className="flex-1 relative bg-[#2b2b2b] flex items-center justify-center overflow-hidden">
          {activeSleeveId ? (
            <CanvasEditor />
          ) : (
            <div className="text-muted-foreground italic">No sleeve selected</div>
          )}
        </section>

        {/* Right Sidebar: Order Details & Preview */}
        <aside className="w-80 border-l border-border bg-[#1e1e1e] flex flex-col flex-shrink-0 z-10">
          <div className="p-4 border-b border-border flex-shrink-0">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">Order Overview</h2>
          </div>
          
          {/* Multi-Sleeve List */}
          <div className="flex-1 overflow-y-auto">
            <MultiSleeveList />
          </div>

          {/* 3D Preview at the bottom */}
          <div className="h-64 border-t border-border bg-black relative flex-shrink-0 flex flex-col">
            <div className="p-2 border-b border-border bg-[#181818] z-10">
              <h2 className="text-xs font-semibold uppercase text-muted-foreground">3D Preview</h2>
            </div>
            <div className="flex-1">
              <Mockup3D />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
