'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { AuthResponse, PermissionKey, SessionUser } from '@udhay/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, refreshSession, setAccessToken, setSessionLostHandler } from './api';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: PermissionKey) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    setSessionLostHandler(() => {
      setAccessToken(null);
      setUser(null);
    });
    refreshSession().then((s) => {
      setUser(s?.user ?? null);
      setLoading(false);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<AuthResponse>('/auth/login', { method: 'POST', json: { email, password } });
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const can = useCallback((p: PermissionKey) => !!user?.permissions[p], [user]);

  const value = useMemo(() => ({ user, loading, login, logout, can }), [user, loading, login, logout, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
