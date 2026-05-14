import type { ImageAdjustments } from '@/lib/imageAdjustments';

export type CanvasAction = 
  | { type: 'UPLOAD_IMAGE'; payload: File }
  | { type: 'ADD_TEXT'; payload?: { multiline: boolean } }
  | { type: 'APPLY_FRAME'; payload: string }
  | { type: 'APPLY_IMAGE_FILTER'; payload: 'standard' | 'bw' | 'enhance' }
  | { type: 'SET_IMAGE_ADJUSTMENTS'; payload: Partial<ImageAdjustments> }
  | { type: 'RESET_IMAGE_ADJUSTMENTS' }
  | { type: 'TOGGLE_FORMAT'; payload: 'bold' | 'italic' | 'underline' }
  | { type: 'SET_TEXT_ALIGN'; payload: 'left' | 'center' | 'right' }
  | { type: 'CHANGE_FONT_SIZE'; payload: number }
  | { type: 'CHANGE_FONT_FAMILY'; payload: string }
  | { type: 'CHANGE_COLOR'; payload: string }
  | { type: 'CHANGE_TEXT_STROKE_COLOR'; payload: string }
  | { type: 'CHANGE_TEXT_STROKE_WIDTH'; payload: number }
  | { type: 'TOGGLE_TEXT_BACKGROUND' }
  | { type: 'CHANGE_TEXT_BACKGROUND_COLOR'; payload: string }
  | { type: 'DELETE_ACTIVE_TEXT' }
  | { type: 'DISCARD_CANVAS_SELECTION' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'CHANGE_FRAME_COLOR'; payload: string };

export const dispatchCanvasAction = (action: CanvasAction) => {
  window.dispatchEvent(new CustomEvent('CANVAS_ACTION', { detail: action }));
};
