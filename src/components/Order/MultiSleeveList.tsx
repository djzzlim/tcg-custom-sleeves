'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MultiSleeveList() {
  const { sleeves, activeSleeveId, addSleeve, setActiveSleeve, removeSleeve, updateSleeve } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId]);

  const handleEditStart = (e: React.MouseEvent, id: string, currentName: string) => {
    e.stopPropagation();
    setEditingId(id);
    setEditName(currentName);
  };

  const handleEditSave = (id: string) => {
    if (editName.trim()) {
      updateSleeve(id, { name: editName.trim() });
    }
    setEditingId(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      {sleeves.map((sleeve) => (
        <div
          key={sleeve.id}
          onClick={() => setActiveSleeve(sleeve.id)}
          onDoubleClick={(e) => handleEditStart(e, sleeve.id, sleeve.name)}
          className={cn(
            "group relative p-3 rounded-lg border cursor-pointer transition-all",
            activeSleeveId === sleeve.id
              ? "bg-secondary border-primary shadow-lg"
              : "bg-background border-border hover:border-muted-foreground"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 overflow-hidden flex-1">
              <div className="w-10 h-14 bg-black border border-border flex-shrink-0 flex items-center justify-center text-[10px] text-muted-foreground overflow-hidden">
                {sleeve.previewUrl ? (
                  <img src={sleeve.previewUrl} alt={sleeve.name} className="w-full h-full object-contain" />
                ) : (
                  '5:7'
                )}
              </div>
              
              {editingId === sleeve.id ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleEditSave(sleeve.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEditSave(sleeve.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="w-full bg-background border border-primary px-2 py-1 text-sm rounded outline-none text-foreground"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="text-sm font-medium truncate flex-1" title="Double click to edit">{sleeve.name}</span>
              )}
            </div>
            
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => handleEditStart(e, sleeve.id, sleeve.name)}
                className="p-1 hover:text-primary"
                title="Edit Name"
              >
                <Edit2 size={14} />
              </button>
              {sleeves.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSleeve(sleeve.id);
                  }}
                  className="p-1 hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={addSleeve}
        className="w-full mt-4 flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-border hover:border-primary hover:bg-secondary transition-all text-sm text-muted-foreground hover:text-primary"
      >
        <Plus size={16} />
        <span>Add New Sleeve</span>
      </button>
    </div>
  );
}
