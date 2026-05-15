'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
  registerAppDialog,
  type AppAlertOptions,
  type AppConfirmOptions,
  type AppDialogVariant,
} from '@/lib/appDialog';

type DialogState =
  | { kind: 'confirm'; options: AppConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'alert'; options: AppAlertOptions; resolve: () => void };

function defaultTitle(variant: AppDialogVariant | undefined, fallback: string) {
  if (variant === 'destructive') return 'Confirm';
  return fallback;
}

export default function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [mounted, setMounted] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const closeDialog = useCallback(() => setDialog(null), []);

  useEffect(() => {
    registerAppDialog({
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          setDialog({ kind: 'confirm', options, resolve });
        }),
      alert: (options) =>
        new Promise<void>((resolve) => {
          setDialog({ kind: 'alert', options, resolve });
        }),
    });
    return () => registerAppDialog(null);
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const focusTarget = dialog.kind === 'confirm' ? cancelRef : confirmRef;
    const id = window.requestAnimationFrame(() => focusTarget.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dialog.kind === 'confirm') {
        dialog.resolve(false);
        closeDialog();
      } else {
        dialog.resolve();
        closeDialog();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog, closeDialog]);

  const handleConfirm = () => {
    if (!dialog) return;
    if (dialog.kind === 'confirm') dialog.resolve(true);
    else dialog.resolve();
    closeDialog();
  };

  const handleCancel = () => {
    if (!dialog || dialog.kind !== 'confirm') return;
    dialog.resolve(false);
    closeDialog();
  };

  if (!dialog || !mounted) {
    return <>{children}</>;
  }

  const isDestructive = dialog.options.variant === 'destructive';
  const title =
    dialog.options.title ??
    (dialog.kind === 'confirm'
      ? defaultTitle(dialog.options.variant, 'Are you sure?')
      : 'Notice');

  const confirmLabel =
    dialog.options.confirmLabel ??
    (dialog.kind === 'confirm' ? (isDestructive ? 'Remove' : 'OK') : 'OK');

  const cancelLabel =
    dialog.kind === 'confirm' ? (dialog.options.cancelLabel ?? 'Cancel') : undefined;

  const modal = createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={dialog.kind === 'confirm' ? handleCancel : handleConfirm}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
        className="relative z-[101] w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="app-dialog-title" className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <p
          id="app-dialog-message"
          className="mt-2 text-sm leading-relaxed text-muted-foreground"
        >
          {dialog.options.message}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {dialog.kind === 'confirm' && (
            <button
              ref={cancelRef}
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-white/10"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            className={cn(
              'rounded-lg px-4 py-2.5 text-sm font-bold transition-colors',
              isDestructive
                ? 'bg-destructive text-destructive-foreground hover:brightness-110'
                : 'bg-primary text-primary-foreground hover:brightness-110'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      {children}
      {modal}
    </>
  );
}
