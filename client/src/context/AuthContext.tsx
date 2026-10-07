import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  ApiError,
  getMeApi,
  loginApi,
  logoutApi,
  registerApi,
} from '../api/client';

export interface UserContext {
  userId: string;
  organizationId: string;
  name?: string;
  email?: string;
}

export interface AuthContextType {
  user: UserContext | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    organizationName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACCESS_TOKEN_KEY = 'flowsuite_access_token';
const REFRESH_TOKEN_KEY = 'flowsuite_refresh_token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    localStorage.getItem(ACCESS_TOKEN_KEY),
  );
  const [, setRefreshToken] = useState<string | null>(() =>
    localStorage.getItem(REFRESH_TOKEN_KEY),
  );
  const [user, setUser] = useState<UserContext | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  useEffect(() => {
    const initializeAuth = async () => {
      const storedAccessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (storedAccessToken) {
        try {
          const res = await getMeApi(storedAccessToken);
          setUser({
            userId: res.data.userId,
            organizationId: res.data.organizationId,
          });
          setAccessToken(storedAccessToken);
        } catch {
          // Token is invalid/expired
          localStorage.removeItem(ACCESS_TOKEN_KEY);
          localStorage.removeItem(REFRESH_TOKEN_KEY);
          setAccessToken(null);
          setRefreshToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (credentials: { email: string; password: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await loginApi(credentials);
      const { accessToken: newAccess, refreshToken: newRefresh, user: authUser, organization } =
        res.data;

      localStorage.setItem(ACCESS_TOKEN_KEY, newAccess);
      localStorage.setItem(REFRESH_TOKEN_KEY, newRefresh);
      setAccessToken(newAccess);
      setRefreshToken(newRefresh);
      setUser({
        userId: authUser.id,
        organizationId: organization.id,
        name: authUser.name,
        email: authUser.email,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to login. Please check your credentials.');
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: {
    name: string;
    email: string;
    password: string;
    organizationName: string;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await registerApi(data);
      const { accessToken: newAccess, refreshToken: newRefresh, user: authUser, organization } =
        res.data;

      localStorage.setItem(ACCESS_TOKEN_KEY, newAccess);
      localStorage.setItem(REFRESH_TOKEN_KEY, newRefresh);
      setAccessToken(newAccess);
      setRefreshToken(newRefresh);
      setUser({
        userId: authUser.id,
        organizationId: organization.id,
        name: authUser.name,
        email: authUser.email,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Registration failed. Please try again.');
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    if (accessToken) {
      try {
        await logoutApi(accessToken);
      } catch {
        // Ignore logout network errors
      }
    }
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    setError(null);
  };

  const value = {
    user,
    accessToken,
    isAuthenticated: !!accessToken && !!user,
    isLoading,
    error,
    login,
    register,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
