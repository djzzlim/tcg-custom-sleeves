'use client';

import { useStore, EditorTab } from '@/store/useStore';
import {
  Image as ImageIcon,
  Frame,
  Type,
  LayoutGrid,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const desktopTabs: { id: Exclude<EditorTab, null | 'Preview' | 'Adjustments'>; label: string; icon: typeof ImageIcon }[] = [
  { id: 'Photos', label: 'Photos', icon: ImageIcon },
  { id: 'Frames', label: 'Frames', icon: Frame },
  { id: 'Text', label: 'Text', icon: Type },
];

const mobileTabs: { id: Exclude<EditorTab, null>; label: string; icon: typeof ImageIcon }[] = [
  { id: 'Photos', label: 'Photos', icon: ImageIcon },
  { id: 'Adjustments', label: 'Adjust', icon: SlidersHorizontal },
  { id: 'Frames', label: 'Frames', icon: Frame },
  { id: 'Text', label: 'Text', icon: Type },
  { id: 'Preview', label: 'Preview', icon: LayoutGrid },
];

export default function EditorSidebar() {
  const { activeTab, setActiveTab } = useStore();

  const handleTabClick = (tabId: Exclude<EditorTab, null>) => {
    // Tapping the active tab again closes the panel — important for mobile UX.
    if (activeTab === tabId) {
      setActiveTab(null);
    } else {
      setActiveTab(tabId);
    }
  };

  return (
    <>
      {/* Desktop: left rail */}
      <div className="hidden lg:flex w-20 bg-[#1e1e1e] border-r border-border h-full flex-col items-center py-4 gap-2 z-10">
        {desktopTabs.map((tab) => {
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
        {mobileTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md transition-colors min-w-0 px-0.5',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[9px] font-medium leading-tight truncate max-w-full">
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
