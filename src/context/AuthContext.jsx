import { createContext, useContext, useState, useEffect } from 'react';
import { setSessionExpiredHandler } from '../utils/api';

const AuthContext = createContext(null);

// In dev, use empty string to go through Vite proxy (avoids CORS)
// In prod, set VITE_API_URL to the actual API domain
const API_BASE = import.meta.env.VITE_API_URL || '';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem('j41_isAdmin') === 'true');

  // requireAuth: call this to trigger the login modal. Returns void.
  // Components can use: const { requireAuth } = useAuth(); then requireAuth();
  function requireAuth() {
    if (!user) setShowAuthModal(true);
  }

  // Check session on mount + register 401 handler
  useEffect(() => {
    checkSession();
    setSessionExpiredHandler(() => {
      setUser(null);
      setIsAdmin(false);
      sessionStorage.removeItem('j41_isAdmin');
      setShowAuthModal(true);
    });
  }, []);

  // Check admin access once per session (not on every navigation)
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      sessionStorage.removeItem('j41_isAdmin');
      return;
    }
    // Already checked this session — skip the fetch
    if (sessionStorage.getItem('j41_isAdmin_checked') === 'true') return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/internal/admin-stats`, {
          credentials: 'include',
        });
        const admin = res.ok;
        setIsAdmin(admin);
        sessionStorage.setItem('j41_isAdmin', String(admin));
      } catch {
        setIsAdmin(false);
        sessionStorage.setItem('j41_isAdmin', 'false');
      }
      sessionStorage.setItem('j41_isAdmin_checked', 'true');
    })();
  }, [user]);

  async function checkSession() {
    try {
      const res = await fetch(`${API_BASE}/auth/session`, {
        credentials: 'include',
      });
      const data = await res.json();
      
      if (data.data?.authenticated) {
        setUser({ 
          verusId: data.data.verusId,
          identityName: data.data.identityName 
        });
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function getChallenge() {
    const res = await fetch(`${API_BASE}/auth/consent/challenge`, {
      credentials: 'include',
    });
    
    if (!res.ok) {
      let errorMsg = `Server error: ${res.status}`;
      try {
        const errData = await res.json();
        if (errData.error?.message) errorMsg = errData.error.message;
      } catch {}
      throw new Error(errorMsg);
    }

    const data = await res.json();
    
    if (!data.data) {
      throw new Error(data.error?.message || 'Failed to get challenge');
    }
    
    return data.data;
  }

  async function login(challengeId, verusId, signature) {
    const res = await fetch(`${API_BASE}/auth/consent/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ challengeId, verusId, signature }),
    });
    
    const text = await res.text();
    if (!text) {
      throw new Error('Empty response from server');
    }
    
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Invalid response from server (status ${res.status})`);
    }
    
    if (!res.ok) {
      throw new Error(data.error?.message || 'Login failed');
    }
    
    setUser({ 
      verusId: data.data.identityAddress,  // Use resolved i-address, not input
      identityName: data.data.identityName 
    });
    return data.data;
  }

  async function refreshUser() {
    await checkSession();
  }

  async function logout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Logout failed — clear local state anyway
    }
    setUser(null);
    setIsAdmin(false);
    sessionStorage.removeItem('j41_isAdmin');
    sessionStorage.removeItem('j41_isAdmin_checked');
  }

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, getChallenge, login, logout, refreshUser, requireAuth, showAuthModal, setShowAuthModal }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
