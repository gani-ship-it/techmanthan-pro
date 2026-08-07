'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface AdminAuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (password: string) => boolean;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  login: () => false,
  logout: () => {},
});

const AUTH_KEY = 'techmanthan_admin_session';

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  useEffect(() => {
    // Validate session on load
    const session = sessionStorage.getItem(AUTH_KEY);
    if (session) {
      try {
        const { expiry } = JSON.parse(session);
        if (expiry && Date.now() < expiry) {
          setIsAuthenticated(true);
        } else {
          sessionStorage.removeItem(AUTH_KEY);
        }
      } catch (err) {
        sessionStorage.removeItem(AUTH_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = (password: string): boolean => {
    const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'speedtyping26';
    if (password === adminPassword) {
      // 8 hour session expiry
      const expiry = Date.now() + 8 * 60 * 60 * 1000;
      sessionStorage.setItem(AUTH_KEY, JSON.stringify({ authenticated: true, expiry }));
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    sessionStorage.removeItem(AUTH_KEY);
    setIsAuthenticated(false);
    router.push('/admin/login');
  };

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}
