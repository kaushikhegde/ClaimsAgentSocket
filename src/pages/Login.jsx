import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const from = location.state?.from?.pathname || '/';

  // Already signed in? Skip the form.
  if (isAuthenticated) return <Navigate to={from} replace />;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (login(username.trim(), password)) {
      navigate(from, { replace: true });
    } else {
      setError('Invalid username or password.');
    }
  };

  const inputClass =
    'w-full pl-9 pr-3 py-2.5 text-[14px] rounded-lg border border-gray-200 bg-gray-50/50 ' +
    'text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#464e7e] ' +
    'focus:ring-2 focus:ring-[#464e7e]/15 focus:bg-white transition';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fc] px-4">
      <div className="w-full max-w-[400px]">
        {/* Brand lockup */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#464e7e] flex items-center justify-center shadow-sm">
            <span className="text-white text-lg font-bold">S</span>
          </div>
          <div className="leading-tight">
            <p className="text-gray-900 font-semibold text-[16px] tracking-tight">Scyne</p>
            <p className="text-gray-400 text-[12px]">Training Assistance</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200/60 rounded-[15px] shadow-sm p-8">
          <h1 className="text-[20px] font-semibold text-gray-900 mb-1">Welcome back</h1>
          <p className="text-[13.5px] text-gray-500 mb-6">Sign in to your workspace</p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="username" className="block text-[12.5px] font-medium text-gray-700 mb-1.5">
                Username
              </label>
              <div className="relative">
                <User size={16} strokeWidth={1.8} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-[12.5px] font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock size={16} strokeWidth={1.8} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass + ' !pr-10'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-[12.5px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <AlertCircle size={15} strokeWidth={1.8} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-[#464e7e] text-white text-[14px] font-semibold hover:bg-[#3b4269] focus:outline-none focus:ring-2 focus:ring-[#464e7e]/30 transition"
            >
              Sign in
            </button>
          </form>
        </div>

        <p className="text-center text-[11.5px] text-gray-400 mt-6">
          © 2026 Scyne · Training Assistance Platform
        </p>
      </div>
    </div>
  );
}
