import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Scenarios from './pages/Scenarios';
import Sessions from './pages/Sessions';
import Performance from './pages/Performance';
import SessionDetail from './pages/SessionDetail';
import Coaching from './pages/Coaching';
import Leaderboard from './pages/Leaderboard';
import Training from './pages/Training';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/scenarios" element={<Scenarios />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/coaching" element={<Coaching />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Route>
        <Route path="/training/:scenarioId" element={<Training />} />
      </Routes>
    </BrowserRouter>
  );
}
