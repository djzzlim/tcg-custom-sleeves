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
import { orderMeetsPackRequirements } from '@/lib/packOrder';

export default function Home() {
  const router = useRouter();
  const {
    purchaseId,
    generatePurchaseId,
    packs,
    sleeves,
    activeSleeveId,
    mobileOrderOpen,
    setMobileOrderOpen,
  } = useStore();

  const [isCheckingOut] = useState(false);

  useEffect(() => {
    if (!purchaseId) {
      generatePurchaseId();
    }
  }, [purchaseId, generatePurchaseId]);

  const handleCheckout = () => {
    router.push('/checkout');
  };

  const checkoutReady = orderMeetsPackRequirements(packs, sleeves).ok;

  return (
    <main className="h-[100dvh] w-screen bg-background text-foreground flex flex-col overflow-hidden font-sans">
      {/* Top Header */}
      <header className="h-14 sm:h-16 border-b border-border bg-[#181818] flex justify-between items-center px-3 sm:px-6 flex-shrink-0 z-20">
        <div className="flex items-center min-w-0">
          <img
            src="/logo.jpeg"
            alt="Client Logo"
            className="h-9 sm:h-12 w-auto object-contain invert mix-blend-screen opacity-90"
          />
        </div>

        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <span className="hidden sm:inline text-sm text-muted-foreground font-mono truncate">
            ID: {purchaseId}
          </span>
          <button
            onClick={handleCheckout}
            disabled={isCheckingOut || !checkoutReady}
            title={
              checkoutReady
                ? 'Open basket'
                : 'Every pack needs designs with photos, and each pack’s quantities must match its size'
            }
            className="px-3 sm:px-6 py-2 sm:py-2.5 rounded bg-primary text-black font-bold uppercase tracking-wider text-xs sm:text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <ShoppingCart size={18} strokeWidth={2.5} />
            <span className="hidden xs:inline sm:inline">
              {isCheckingOut ? 'Processing…' : 'Add to Basket'}
            </span>
            <span className="xs:hidden sm:hidden">Basket</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden pb-16 lg:pb-0">

        {/* Left Sidebars */}
        <div className="contents lg:flex lg:h-full lg:flex-shrink-0">
          <EditorSidebar />
          <EditorSubPanel />
        </div>

        {/* Center Canvas */}
        <section className="flex-1 relative bg-[#2b2b2b] flex items-center justify-center overflow-hidden">
          {activeSleeveId ? (
            <CanvasEditor />
          ) : (
            <div className="max-w-md px-6 text-center text-sm text-muted-foreground">
              {packs.length === 0 ? (
                <p>
                  Set up your first pack{' '}
                  <span className="hidden lg:inline">on the right</span>
                  <span className="lg:hidden">
                    — tap <strong>Order</strong> below
                  </span>
                  {' '}— pick <strong>65 or 110 sleeves</strong> and{' '}
                  <strong>Standard or Japanese</strong>, then start designing. You can add more packs later.
                </p>
              ) : (
                <p className="italic">
                  Pick a design{' '}
                  <span className="hidden lg:inline">on the right</span>
                  <span className="lg:hidden">from the Order menu</span>{' '}
                  to edit it.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Right Sidebar (desktop) */}
        <aside className="hidden lg:flex w-80 border-l border-border bg-[#1e1e1e] flex-col flex-shrink-0 z-10">
          <div className="p-4 border-b border-border flex-shrink-0">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">Order overview</h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            <MultiSleeveList />
          </div>

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

      {/* Mobile order sheet */}
      {mobileOrderOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setMobileOrderOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={
          'lg:hidden fixed left-0 right-0 bottom-16 z-40 ' +
          'max-h-[80vh] flex flex-col rounded-t-2xl shadow-2xl border-t border-border bg-[#1e1e1e] ' +
          'transition-transform duration-200 ease-out ' +
          (mobileOrderOpen ? 'translate-y-0' : 'translate-y-[110%] pointer-events-none')
        }
        aria-hidden={!mobileOrderOpen}
      >
        <div className="flex items-center justify-center pt-2">
          <span className="block h-1 w-10 rounded-full bg-white/20" aria-hidden />
        </div>
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Order overview</h2>
          <button
            onClick={() => setMobileOrderOpen(false)}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <MultiSleeveList />
        </div>
        <div className="h-48 border-t border-border bg-black relative flex-shrink-0 flex flex-col">
          <div className="p-2 border-b border-border bg-[#181818] z-10">
            <h2 className="text-xs font-semibold uppercase text-muted-foreground">3D Preview</h2>
          </div>
          <div className="flex-1">
            {mobileOrderOpen && <Mockup3D />}
          </div>
        </div>
      </aside>
    </main>
  );
}
