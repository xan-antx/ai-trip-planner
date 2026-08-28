import { createContext, useContext, useEffect, useState } from 'react';
import { api, TOKEN_KEY, getToken } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `loading` covers the initial "do we have a valid token?" check, so the app
  // doesn't flash the login page for an already-signed-in user on refresh.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((data) => setUser(data.user))
      .catch((err) => {
        // Only a definitive rejection of the token (expired or tampered)
        // clears it. A 500, timeout, or network failure (no err.status)
        // keeps the session; the next refresh simply retries.
        if (err.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
        } else {
          console.error('Could not verify session:', err.message);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function authenticate(mode, email, password) {
    const data = mode === 'signup' ? await api.signup(email, password) : await api.login(email, password);
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, authenticate, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
