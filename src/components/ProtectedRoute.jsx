import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// Wraps protected route elements. Sends unauthenticated users to /login and
// remembers where they were headed so we can return them there after sign-in.
export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
