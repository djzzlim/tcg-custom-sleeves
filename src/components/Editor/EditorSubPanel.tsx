'use client';

import { useStore } from '@/store/useStore';
import { dispatchCanvasAction } from '@/lib/events';
import {
  Upload, Type, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRef } from 'react';

export default function EditorSubPanel() {
  const { activeTab, activeObjectType, textProps } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!activeTab) return null;

  return (
    <div className="w-72 bg-[#222222] border-r border-border h-full overflow-y-auto p-4 flex flex-col z-10">
      <h2 className="text-xl font-serif italic mb-4">{activeTab}</h2>

      {activeTab === 'Photos' && (
        <div className="flex flex-col gap-4">
          <button
            className="w-full flex flex-col items-center justify-center gap-2 border-2 border-primary rounded-full py-4 text-primary hover:bg-primary/10 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={24} />
            <span className="font-semibold">Upload images</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                dispatchCanvasAction({ type: 'UPLOAD_IMAGE', payload: file });
                // Reset input so the same file can be uploaded again if needed
                e.target.value = '';
              }
            }}
          />
        </div>
      )}

      {activeTab === 'Frames' && (
        <div className="flex flex-col gap-4">
          {activeObjectType === 'frame' ? (
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <h3 className="text-sm font-semibold uppercase">Frame Properties</h3>
              <p className="text-xs text-muted-foreground mb-2">Click anywhere else on the canvas to see other frames.</p>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground">Color</label>
                <input
                  type="color"
                  value={textProps.fill || "#ffffff"}
                  onChange={(e) => dispatchCanvasAction({ type: 'CHANGE_FRAME_COLOR', payload: e.target.value })}
                  className="w-full h-10 p-0 bg-transparent border border-border rounded cursor-pointer"
                />
              </div>
              <button
                onClick={() => dispatchCanvasAction({ type: 'APPLY_FRAME', payload: 'none' })}
                className="w-full py-2 mt-4 border border-destructive/50 text-destructive rounded text-sm hover:bg-destructive/10 transition-colors"
              >
                Remove Frame
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-foreground">Choose a frame style:</p>
              <div className="grid grid-cols-2 gap-[2px] bg-border p-[2px] border border-border">
                {[
                  { id: 'none', label: 'Sleeveless', src: null },
                  { id: 'standard', src: '/frames/01.svg?v=8' },
                  { id: 'fade', src: '/frames/02.svg?v=8' },
                  { id: 'torn1', src: '/frames/03.svg?v=8' },
                  { id: 'torn2', src: '/frames/04.svg?v=8' },
                  { id: 'wobble', src: '/frames/05.svg?v=8' },
                  { id: 'floral', src: '/frames/06.svg?v=8' },
                  { id: 'scallop', src: '/frames/07.svg?v=8' },
                  { id: 'stamp', src: '/frames/08.svg?v=8' },
                  { id: 'wavy', src: '/frames/09.svg?v=8' },
                  { id: 'zigzag', src: '/frames/10.svg?v=8' },
                ].map((frame) => (
                  <button
                    key={frame.id}
                    onClick={() => dispatchCanvasAction({ type: 'APPLY_FRAME', payload: frame.id })}
                    className="aspect-[4/5] bg-[#f2ce1b] hover:brightness-110 relative overflow-hidden flex items-center justify-center transition-all group border-2 border-transparent hover:border-primary"
                  >
                    <div className="w-[85%] h-[85%] bg-[#a8a497] rotate-[-5deg] relative transition-transform group-hover:rotate-0 flex items-center justify-center overflow-hidden">
                      {frame.src ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={frame.src} alt={frame.id} className="absolute inset-0 w-full h-full object-fill pointer-events-none" />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center p-2">
                          <span className="text-[10px] font-bold text-black/40 uppercase tracking-tighter leading-none">No</span>
                          <span className="text-[10px] font-bold text-black/40 uppercase tracking-tighter leading-none">Frame</span>
                        </div>
                      )}
                    </div>
                    {frame.label && (
                       <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-white py-0.5 text-center font-bold uppercase">
                         {frame.label}
                       </div>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'Text' && (
        <div className="flex flex-col gap-4">
          <button
            className="w-full flex items-center gap-2 border border-primary rounded-full py-2 px-4 text-primary hover:bg-primary/10 transition-colors"
            onClick={() => dispatchCanvasAction({ type: 'ADD_TEXT' })}
          >
            <span className="text-lg leading-none">+</span> Add text
          </button>

          {activeObjectType === 'i-text' && (
            <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
              <h3 className="text-sm font-semibold uppercase">Text Properties</h3>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground">Font</label>
                <select
                  className="bg-background border border-border rounded px-2 py-1 text-sm outline-none focus:border-primary"
                  value={textProps.fontFamily}
                  onChange={(e) => dispatchCanvasAction({ type: 'CHANGE_FONT_FAMILY', payload: e.target.value })}
                >
                  <option value="Inter">Inter</option>
                  <option value="Outfit">Outfit</option>
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times</option>
                  <option value="Courier New">Courier</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Verdana">Verdana</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground">Color</label>
                <input
                  type="color"
                  value={textProps.fill}
                  onChange={(e) => dispatchCanvasAction({ type: 'CHANGE_COLOR', payload: e.target.value })}
                  className="w-full h-10 p-0 bg-transparent border border-border rounded cursor-pointer"
                />
              </div>

              <div className="flex gap-2 bg-background p-1 rounded border border-border">
                <button
                  onClick={() => dispatchCanvasAction({ type: 'TOGGLE_FORMAT', payload: 'bold' })}
                  className={cn("flex-1 py-1 rounded flex justify-center hover:bg-muted", textProps.fontWeight === 'bold' && "bg-primary/20 text-primary")}
                >
                  <Bold size={16} />
                </button>
                <button
                  onClick={() => dispatchCanvasAction({ type: 'TOGGLE_FORMAT', payload: 'italic' })}
                  className={cn("flex-1 py-1 rounded flex justify-center hover:bg-muted", textProps.fontStyle === 'italic' && "bg-primary/20 text-primary")}
                >
                  <Italic size={16} />
                </button>
                <button
                  onClick={() => dispatchCanvasAction({ type: 'TOGGLE_FORMAT', payload: 'underline' })}
                  className={cn("flex-1 py-1 rounded flex justify-center hover:bg-muted", textProps.underline && "bg-primary/20 text-primary")}
                >
                  <Underline size={16} />
                </button>
              </div>

              <div className="flex gap-2 bg-background p-1 rounded border border-border">
                <button
                  onClick={() => dispatchCanvasAction({ type: 'SET_TEXT_ALIGN', payload: 'left' })}
                  className={cn("flex-1 py-1 rounded flex justify-center hover:bg-muted", textProps.textAlign === 'left' && "bg-primary/20 text-primary")}
                >
                  <AlignLeft size={16} />
                </button>
                <button
                  onClick={() => dispatchCanvasAction({ type: 'SET_TEXT_ALIGN', payload: 'center' })}
                  className={cn("flex-1 py-1 rounded flex justify-center hover:bg-muted", textProps.textAlign === 'center' && "bg-primary/20 text-primary")}
                >
                  <AlignCenter size={16} />
                </button>
                <button
                  onClick={() => dispatchCanvasAction({ type: 'SET_TEXT_ALIGN', payload: 'right' })}
                  className={cn("flex-1 py-1 rounded flex justify-center hover:bg-muted", textProps.textAlign === 'right' && "bg-primary/20 text-primary")}
                >
                  <AlignRight size={16} />
                </button>
              </div>

              <div className="flex items-center justify-between bg-background border border-border rounded p-1">
                <button
                  onClick={() => dispatchCanvasAction({ type: 'CHANGE_FONT_SIZE', payload: -2 })}
                  className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded"
                >
                  -
                </button>
                <span className="text-sm font-mono w-8 text-center">{textProps.fontSize}</span>
                <button
                  onClick={() => dispatchCanvasAction({ type: 'CHANGE_FONT_SIZE', payload: 2 })}
                  className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded"
                >
                  +
                </button>
              </div>

            </div>
          )}
        </div>
      )}

      {/* Placeholders for other tabs */}
      {['Layouts', 'Sticker', 'Photo Frame', 'Emojis'].includes(activeTab) && (
        <div className="text-sm text-muted-foreground italic">
          {activeTab} options coming soon.
        </div>
      )}
    </div>
  );
}
