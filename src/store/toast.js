import { create } from 'zustand';

let nextId = 0;

export const useToastStore = create((set, get) => ({
  toasts: [],

  push: ({ title, message, type = 'info', duration = 4500, action = null }) => {
    const id = ++nextId;
    set((s) => ({ toasts: [...s.toasts, { id, title, message, type, action }] }));

    if (duration > 0) {
      setTimeout(() => get().dismiss(id), duration);
    }
    return id;
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/**
 * Raccourci utilisable hors composant React (services, store, gestionnaires
 * d'erreurs), là où on ne peut pas appeler un hook.
 */
export const toast = {
  success: (message, title) => useToastStore.getState().push({ message, title, type: 'success' }),
  error: (message, title) =>
    useToastStore.getState().push({ message, title, type: 'error', duration: 7000 }),
  warning: (message, title) => useToastStore.getState().push({ message, title, type: 'warning' }),
  info: (message, title) => useToastStore.getState().push({ message, title, type: 'info' }),
  custom: (options) => useToastStore.getState().push(options),
};
