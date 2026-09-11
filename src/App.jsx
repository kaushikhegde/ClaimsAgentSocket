import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Scenarios from './pages/Scenarios';
import Sessions from './pages/Sessions';
import Performance from './pages/Performance';
import SessionDetail from './pages/SessionDetail';
import Coaching from './pages/Coaching';
import Leaderboard from './pages/Leaderboard';
import Training from './pages/Training';
import ScenarioList from './pages/admin/ScenarioList';
import ScenarioEditor from './pages/admin/ScenarioEditor';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/scenarios" element={<Scenarios />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/sessions/:id" element={<SessionDetail />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/coaching" element={<Coaching />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/admin/scenarios" element={<ScenarioList />} />
            <Route path="/admin/scenarios/new" element={<ScenarioEditor />} />
            <Route path="/admin/scenarios/:id" element={<ScenarioEditor />} />
          </Route>
          <Route
            path="/training/:scenarioId"
            element={<ProtectedRoute><Training /></ProtectedRoute>}
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
