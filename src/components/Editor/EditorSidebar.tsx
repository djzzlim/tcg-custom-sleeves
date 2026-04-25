'use client';

import { useStore, EditorTab } from '@/store/useStore';
import { 
  Image as ImageIcon, 
  LayoutTemplate, 
  Frame, 
  Type, 
  Sticker, 
  ImagePlus, 
  Smile 
} from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs: { id: EditorTab; label: string; icon: any }[] = [
  { id: 'Photos', label: 'Photos', icon: ImageIcon },
  { id: 'Layouts', label: 'Layouts', icon: LayoutTemplate },
  { id: 'Frames', label: 'Frames', icon: Frame },
  { id: 'Text', label: 'Text', icon: Type },
  { id: 'Sticker', label: 'Sticker', icon: Sticker },
  { id: 'Photo Frame', label: 'Photo Frame', icon: ImagePlus },
  { id: 'Emojis', label: 'Emojis', icon: Smile },
];

export default function EditorSidebar() {
  const { activeTab, setActiveTab } = useStore();

  return (
    <div className="w-20 bg-[#1e1e1e] border-r border-border h-full flex flex-col items-center py-4 gap-2 z-10">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-md transition-colors",
              isActive ? "bg-card text-primary" : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
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
  );
}
