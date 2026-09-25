import { createContext, useContext, useState, useCallback } from 'react';

// Hard-coded demo credentials. Change these two values to update the login.
// NOTE: this is a client-side gate only — credentials ship in the JS bundle,
// so it deters casual access but is NOT real authentication.
const CREDENTIALS = { username: 'admin', password: 'admin123' };
const STORAGE_KEY = 'scyne_auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true'
  );

  const login = useCallback((username, password) => {
    const ok =
      username === CREDENTIALS.username && password === CREDENTIALS.password;
    if (ok) {
      localStorage.setItem(STORAGE_KEY, 'true');
      setIsAuthenticated(true);
    }
    return ok;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
