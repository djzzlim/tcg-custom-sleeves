export type CanvasAction = 
  | { type: 'UPLOAD_IMAGE'; payload: File }
  | { type: 'ADD_TEXT'; payload?: { multiline: boolean } }
  | { type: 'APPLY_FRAME'; payload: string }
  | { type: 'TOGGLE_FORMAT'; payload: 'bold' | 'italic' | 'underline' }
  | { type: 'SET_TEXT_ALIGN'; payload: 'left' | 'center' | 'right' }
  | { type: 'CHANGE_FONT_SIZE'; payload: number }
  | { type: 'CHANGE_FONT_FAMILY'; payload: string }
  | { type: 'CHANGE_COLOR'; payload: string }
  | { type: 'CHANGE_FRAME_COLOR'; payload: string };

export const dispatchCanvasAction = (action: CanvasAction) => {
  window.dispatchEvent(new CustomEvent('CANVAS_ACTION', { detail: action }));
};
