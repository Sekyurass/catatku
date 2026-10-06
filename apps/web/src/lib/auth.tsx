import type {
  AuthResponse,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
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
import { api, refreshSession, setAccessToken, setSessionLostHandler } from './api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: UserDTO | null;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  /** Sesi di perangkat lain berakhir; perangkat ini menerima sesi baru. */
  changePassword: (input: ChangePasswordInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserDTO | null>(null);

  const applySession = useCallback((session: AuthResponse | null) => {
    setAccessToken(session?.accessToken ?? null);
    setUser(session?.user ?? null);
    setStatus(session ? 'authenticated' : 'anonymous');
  }, []);

  useEffect(() => {
    let active = true;
    refreshSession().then((session) => active && applySession(session));
    setSessionLostHandler(() => {
      applySession(null);
      queryClient.clear();
    });
    return () => {
      active = false;
      setSessionLostHandler(null);
    };
  }, [applySession, queryClient]);

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

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      applySession(null);
      queryClient.clear();
    }
  }, [applySession, queryClient]);

  const value = useMemo(
    () => ({ status, user, login, register, updateProfile, changePassword, logout }),
    [status, user, login, register, updateProfile, changePassword, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}
