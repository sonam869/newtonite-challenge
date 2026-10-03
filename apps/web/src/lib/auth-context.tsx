'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '@/lib/api';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  globalRole: string;
  teams: Array<{ teamId: string; teamName: string; role: string }>;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    api.getMe()
      .then(res => setUser(res.data))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    localStorage.setItem('token', res.token);
    const me = await api.getMe();
    setUser(me.data);
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await api.register(name, email, password);
    localStorage.setItem('token', res.token);
    const me = await api.getMe();
    setUser(me.data);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
