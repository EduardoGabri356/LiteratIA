import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HubView from './views/HubView';
import PhaseQuotesView from './views/PhaseQuotesView';
import PointAndClickView from './views/PointAndClickView';
import DebateView from './views/DebateView';
import VictoryScreen from './views/VictoryScreen';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HubView />} />
        <Route path="/game/:slug/quotes" element={<PhaseQuotesView />} />
        <Route path="/game/:slug/map" element={<PointAndClickView />} />
        <Route path="/game/:slug/debate" element={<DebateView />} />
        <Route path="/game/:slug/victory" element={<VictoryScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}