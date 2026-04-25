import { create } from 'zustand';

export type EditorTab = 'Photos' | 'Layouts' | 'Frames' | 'Text' | 'Sticker' | 'Photo Frame' | 'Emojis' | null;

export interface SleeveDesign {
  id: string;
  name: string;
  canvasData?: string; // JSON string from fabric.js
  previewUrl?: string; // Data URL for thumbnail/preview
}

interface AppState {
  purchaseId: string;
  sleeves: SleeveDesign[];
  activeSleeveId: string | null;
  remarks: string;
  activeTab: EditorTab;
  
  // Editor state
  activeObjectType: string | null;
  textProps: {
    fontFamily: string;
    fontSize: number;
    fill: string;
    fontWeight: string | number;
    fontStyle: string;
    underline: boolean;
    textAlign: string;
  };

  // Actions
  addSleeve: () => void;
  updateSleeve: (id: string, data: Partial<SleeveDesign>) => void;
  removeSleeve: (id: string) => void;
  setActiveSleeve: (id: string) => void;
  setRemarks: (remarks: string) => void;
  generatePurchaseId: () => void;
  setActiveTab: (tab: EditorTab) => void;
  setActiveObjectType: (type: string | null) => void;
  setTextProps: (props: Partial<AppState['textProps']>) => void;
}

export const useStore = create<AppState>((set) => ({
  purchaseId: '',
  sleeves: [],
  activeSleeveId: null,
  remarks: '',
  activeTab: 'Photos',
  activeObjectType: null,
  textProps: {
    fontFamily: 'Arial',
    fontSize: 32,
    fill: '#ffffff',
    fontWeight: 'normal',
    fontStyle: 'normal',
    underline: false,
    textAlign: 'center',
  },

  generatePurchaseId: () => {

    const id = 'PUR-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    set({ purchaseId: id });
  },

  addSleeve: () => set((state) => {
    const newId = crypto.randomUUID();
    const newSleeve: SleeveDesign = {
      id: newId,
      name: `Sleeve #${state.sleeves.length + 1}`,
    };
    return {
      sleeves: [...state.sleeves, newSleeve],
      activeSleeveId: newId,
    };
  }),

  updateSleeve: (id, data) => set((state) => ({
    sleeves: state.sleeves.map((s) => s.id === id ? { ...s, ...data } : s)
  })),

  removeSleeve: (id) => set((state) => {
    const newSleeves = state.sleeves.filter((s) => s.id !== id);
    return {
      sleeves: newSleeves,
      activeSleeveId: state.activeSleeveId === id 
        ? (newSleeves.length > 0 ? newSleeves[0].id : null)
        : state.activeSleeveId
    };
  }),

  setActiveSleeve: (id) => set({ activeSleeveId: id }),
  
  setRemarks: (remarks) => set({ remarks }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setActiveObjectType: (type) => set({ activeObjectType: type }),

  setTextProps: (props) => set((state) => ({ 
    textProps: { ...state.textProps, ...props } 
  })),
}));
