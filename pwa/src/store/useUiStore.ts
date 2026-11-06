import { create } from 'zustand'

type ToastTone = 'default' | 'success' | 'danger'

interface UiState {
  toast: { message: string; tone: ToastTone } | null
  showToast: (message: string, tone?: ToastTone) => void
  clearToast: () => void
}

export const useUiStore = create<UiState>((set) => ({
  toast: null,
  showToast: (message, tone = 'default') => {
    set({ toast: { message, tone } })
  },
  clearToast: () => set({ toast: null }),
}))
