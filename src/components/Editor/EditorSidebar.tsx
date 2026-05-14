'use client';

import { useStore, EditorTab } from '@/store/useStore';
import {
  Image as ImageIcon,
  Frame,
  Type,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs: { id: Exclude<EditorTab, null>; label: string; icon: any }[] = [
  { id: 'Photos', label: 'Photos', icon: ImageIcon },
  { id: 'Frames', label: 'Frames', icon: Frame },
  { id: 'Text', label: 'Text', icon: Type },
];

export default function EditorSidebar() {
  const {
    activeTab,
    setActiveTab,
    mobileOrderOpen,
    setMobileOrderOpen,
  } = useStore();

  const handleTabClick = (tabId: Exclude<EditorTab, null>) => {
    // Tapping the active tab again closes the panel — important for mobile UX.
    if (activeTab === tabId) {
      setActiveTab(null);
    } else {
      setActiveTab(tabId);
      setMobileOrderOpen(false);
    }
  };

  const handleOrderClick = () => {
    setMobileOrderOpen(!mobileOrderOpen);
    if (!mobileOrderOpen) setActiveTab(null);
  };

  return (
    <>
      {/* Desktop: left rail */}
      <div className="hidden lg:flex w-20 bg-[#1e1e1e] border-r border-border h-full flex-col items-center py-4 gap-2 z-10">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                'w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-md transition-colors relative',
                isActive
                  ? 'bg-card text-primary'
                  : 'text-muted-foreground hover:bg-card/50 hover:text-foreground'
              )}
            >
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium leading-tight text-center">{tab.label}</span>
              {isActive && (
                <div className="absolute left-0 w-1 h-10 bg-primary rounded-r-md" />
              )}
            </button>
          );
        })}
      </div>

      {/* Mobile: bottom nav */}
      <nav
        aria-label="Editor sections"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#1e1e1e] border-t border-border flex items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
            </button>
          );
        })}
        <button
          onClick={handleOrderClick}
          aria-pressed={mobileOrderOpen}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md transition-colors',
            mobileOrderOpen ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          <Layers size={20} strokeWidth={mobileOrderOpen ? 2.5 : 2} />
          <span className="text-[10px] font-medium leading-tight">Order</span>
        </button>
      </nav>
    </>
  );
}
