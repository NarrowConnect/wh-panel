import React, { createContext, useContext, useState, useEffect } from 'react';
import ApiClient from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('wh_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [company, setCompany] = useState(() => {
    try {
      const saved = localStorage.getItem('wh_company');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [status, setStatus] = useState('online'); // online, busy, offline
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
      setCompany(null);
      ApiClient.clearTokens();
    };

    window.addEventListener('auth:expired', handleAuthExpired);

    // Verify current user session if token exists
    const checkAuth = async () => {
      const token = ApiClient.getToken();
      if (token) {
        try {
          const res = await ApiClient.get('/auth/me');
          if (res && res.user) {
            setUser(res.user);
            setCompany(res.company);
            localStorage.setItem('wh_user', JSON.stringify(res.user));
            localStorage.setItem('wh_company', JSON.stringify(res.company));
          }
        } catch (err) {
          console.warn('[Auth] Session validation failed:', err.message);
          // Don't clear immediately if network error, only on 401
        }
      }
      setLoading(false);
    };

    checkAuth();

    return () => {
      window.removeEventListener('auth:expired', handleAuthExpired);
    };
  }, []);

  const login = async (email, password, companySlug) => {
    const payload = { email, password };
    if (companySlug) payload.company_slug = companySlug;

    const data = await ApiClient.post('/auth/login', payload);
    ApiClient.setTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    setCompany(data.company);
    localStorage.setItem('wh_user', JSON.stringify(data.user));
    localStorage.setItem('wh_company', JSON.stringify(data.company));
    return data;
  };

  const register = async (companyName, companySlug, adminName, email, password) => {
    const payload = {
      company_name: companyName,
      company_slug: companySlug,
      admin_name: adminName,
      email,
      password,
    };

    const data = await ApiClient.post('/auth/register', payload);
    ApiClient.setTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    setCompany(data.company);
    localStorage.setItem('wh_user', JSON.stringify(data.user));
    localStorage.setItem('wh_company', JSON.stringify(data.company));
    return data;
  };

  const logout = () => {
    ApiClient.clearTokens();
    setUser(null);
    setCompany(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        company,
        status,
        setStatus,
        loading,
        isAuthenticated: !!user && !!ApiClient.getToken(),
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
