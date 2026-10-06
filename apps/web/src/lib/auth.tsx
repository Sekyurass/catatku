import type {
  AuthResponse,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
  UserDTO,
} from '@catatku/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { FAREWELL_MS, SPLASH_FADE_MS, SplashScreen } from '../components/SplashScreen';
import { LoginPage } from '../routes/pages';
import { api, refreshSession, setAccessToken, setSessionLostHandler } from './api';
import { clearAvatarCache } from './avatar';
import { disablePush } from './push';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: UserDTO | null;
  /** true bila sesi berakhir karena pengguna menekan "Keluar" (bukan sesi kedaluwarsa). */
  signedOut: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  /** Sesi di perangkat lain berakhir; perangkat ini menerima sesi baru. */
  changePassword: (input: ChangePasswordInput) => Promise<void>;
  /** Kata sandi baru dari tautan email; berhasil berarti langsung masuk. */
  resetPassword: (input: ResetPasswordInput) => Promise<void>;
  uploadAvatar: (image: Blob) => Promise<void>;
  removeAvatar: () => Promise<void>;
  /** Menampilkan layar "Sampai jumpa" lalu kembali ke halaman masuk. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserDTO | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [farewell, setFarewell] = useState<{ message: string; leaving: boolean } | null>(null);

  const applySession = useCallback((session: AuthResponse | null) => {
    setAccessToken(session?.accessToken ?? null);
    setUser(session?.user ?? null);
    setStatus(session ? 'authenticated' : 'anonymous');
    if (session) setSignedOut(false);
  }, []);

  const endSession = useCallback(() => {
    applySession(null);
    queryClient.clear();
    clearAvatarCache();
  }, [applySession, queryClient]);

  useEffect(() => {
    let active = true;
    refreshSession().then((session) => active && applySession(session));
    setSessionLostHandler(endSession);
    return () => {
      active = false;
      setSessionLostHandler(null);
    };
  }, [applySession, endSession]);

  const login = useCallback(
    async (input: LoginInput) => {
      applySession(await api<AuthResponse>('/auth/login', { method: 'POST', body: input }));
    },
    [applySession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      applySession(await api<AuthResponse>('/auth/register', { method: 'POST', body: input }));
    },
    [applySession],
  );

  const updateProfile = useCallback(async (input: UpdateProfileInput) => {
    const res = await api<{ user: UserDTO }>('/me', { method: 'PATCH', body: input });
    setUser(res.user);
  }, []);

  const changePassword = useCallback(
    async (input: ChangePasswordInput) => {
      applySession(await api<AuthResponse>('/me/password', { method: 'PUT', body: input }));
    },
    [applySession],
  );

  const resetPassword = useCallback(
    async (input: ResetPasswordInput) => {
      applySession(
        await api<AuthResponse>('/auth/reset-password', { method: 'POST', body: input }),
      );
    },
    [applySession],
  );

  const uploadAvatar = useCallback(async (image: Blob) => {
    const res = await api<{ user: UserDTO }>('/me/avatar', { method: 'PUT', body: image });
    setUser(res.user);
  }, []);

  const removeAvatar = useCallback(async () => {
    const res = await api<{ user: UserDTO }>('/me/avatar', { method: 'DELETE' });
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    const message = user ? `Sampai jumpa, ${user.name}!` : 'Sampai jumpa!';
    setFarewell({ message, leaving: false });
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Kegagalan jaringan tetap mengeluarkan pengguna di perangkat ini. Halaman masuk diunduh
    // selama animasi supaya tidak ada layar memuat sesudah layar perpisahan memudar.
    await Promise.allSettled([
      Promise.race([disablePush(), wait(3000)])
        .catch(() => undefined)
        .then(() => api('/auth/logout', { method: 'POST' })),
      wait(reduced ? 0 : FAREWELL_MS),
      LoginPage.preload(),
    ]);
    setSignedOut(true);
    endSession();
    setFarewell({ message, leaving: true });
    await wait(SPLASH_FADE_MS);
    setFarewell(null);
  }, [user, endSession]);

  const value = useMemo(
    () => ({
      status,
      user,
      signedOut,
      login,
      register,
      updateProfile,
      changePassword,
      resetPassword,
      uploadAvatar,
      removeAvatar,
      logout,
    }),
    [
      status,
      user,
      signedOut,
      login,
      register,
      updateProfile,
      changePassword,
      resetPassword,
      uploadAvatar,
      removeAvatar,
      logout,
    ],
  );
  return (
    <AuthContext.Provider value={value}>
      {children}
      {farewell && <SplashScreen farewell={farewell.message} leaving={farewell.leaving} />}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}
