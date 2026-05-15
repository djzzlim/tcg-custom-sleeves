'use client';

import AppDialogProvider from '@/components/ui/AppDialogProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <AppDialogProvider>{children}</AppDialogProvider>;
}
