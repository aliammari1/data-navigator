import { create } from "zustand";

const DEFAULT_REASON = "This action needs a downloaded AI model.";

interface ModelRequiredDialogState {
  open: boolean;
  reason: string | null;
  show: (reason?: string) => void;
  hide: () => void;
}

export const useModelRequiredDialogStore = create<ModelRequiredDialogState>((set) => ({
  open: false,
  reason: null,
  show: (reason) => set({ open: true, reason: reason ?? DEFAULT_REASON }),
  hide: () => set({ open: false }),
}));
