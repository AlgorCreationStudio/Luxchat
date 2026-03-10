import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@shared/schema';

interface AuthState {
  user: User | null;
  token: string | null;
  _hasHydrated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  setUser: (user: User) => void;
  setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      _hasHydrated: false,
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
      setUser: (user) => set({ user }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'luxchat-auth',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
