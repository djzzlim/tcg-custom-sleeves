import { dispatchCanvasAction } from '@/lib/events';
import { useStore } from '@/store/useStore';

/** Persist the active canvas, then resize sleeve copies — avoids losing artwork on qty change. */
export function setDesignQuantityWithSave(designId: string, quantity: number) {
  const { activeSleeveId, setDesignQuantity } = useStore.getState();
  if (activeSleeveId === designId) {
    dispatchCanvasAction({ type: 'FORCE_SAVE' });
  }
  setDesignQuantity(designId, quantity);
}
