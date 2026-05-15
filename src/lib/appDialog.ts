export type AppDialogVariant = 'default' | 'destructive';

export type AppConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: AppDialogVariant;
};

export type AppAlertOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  variant?: AppDialogVariant;
};

type DialogBridge = {
  confirm: (options: AppConfirmOptions) => Promise<boolean>;
  alert: (options: AppAlertOptions) => Promise<void>;
};

let bridge: DialogBridge | null = null;

export function registerAppDialog(next: DialogBridge | null) {
  bridge = next;
}

export function appConfirm(options: AppConfirmOptions): Promise<boolean> {
  if (!bridge) {
    return Promise.resolve(window.confirm(options.message));
  }
  return bridge.confirm(options);
}

export function appAlert(options: AppAlertOptions): Promise<void> {
  if (!bridge) {
    window.alert(options.message);
    return Promise.resolve();
  }
  return bridge.alert(options);
}
