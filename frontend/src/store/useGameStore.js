import { create } from 'zustand';
import { get } from '../services/api';

// O servidor é a fonte da verdade do progresso; aqui só guardamos a estante carregada
// e o resultado da conclusão de cada livro (para a tela de vitória).
export const useGameStore = create((set) => ({
  books: [],
  loaded: false,
  loading: false,
  error: null,
  rewards: {},

  loadSession: async () => {
    set({ loading: true, error: null });
    try {
      const data = await get('/user/session');
      set({ books: data.books, loaded: true, loading: false });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },

  setReward: (slug, reward) => set((s) => ({ rewards: { ...s.rewards, [slug]: reward } })),
}));
