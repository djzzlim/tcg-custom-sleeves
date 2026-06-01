'use client';

import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  value: number;
  min?: number;
  max: number;
  onChange: (next: number) => void;
  size?: 'sm' | 'md';
  className?: string;
  /** Shown under input on focus — e.g. "Max 64 for this design" */
  maxHint?: string;
};

export default function DesignQuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  size = 'md',
  className,
  maxHint,
}: Props) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const btnClass = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  const inputClass = size === 'sm' ? 'h-8 w-12 text-sm' : 'h-9 w-14 text-base';

  const commitDraft = () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || draft.trim() === '') {
      onChange(value);
      setDraft(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, Math.floor(n)));
    onChange(clamped);
    setDraft(String(clamped));
  };

  return (
    <div className={cn('flex flex-col items-end gap-0.5', className)} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-black/25 p-1">
        <button
          type="button"
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className={cn(
            'flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 disabled:opacity-40',
            btnClass
          )}
          aria-label="Decrease quantity"
        >
          <Minus size={size === 'sm' ? 14 : 16} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="Quantity"
          value={draft}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commitDraft();
          }}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, '');
            setDraft(next);
            if (next === '') return;
            const n = Number(next);
            if (Number.isFinite(n) && n >= min) onChange(n);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          className={cn(
            'rounded-md border border-border bg-black/40 text-center font-mono font-semibold tabular-nums text-primary outline-none focus:border-primary',
            inputClass,
            '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
          )}
        />
        <button
          type="button"
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className={cn(
            'flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 disabled:opacity-40',
            btnClass
          )}
          aria-label="Increase quantity"
        >
          <Plus size={size === 'sm' ? 14 : 16} />
        </button>
      </div>
      {focused && maxHint && (
        <span className="text-[9px] text-muted-foreground">{maxHint}</span>
      )}
    </div>
  );
}
