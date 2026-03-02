import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { 
  Search, 
  Users, 
  Camera, 
  Printer, 
  Clock, 
  ListOrdered
} from 'lucide-react';

import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Consulta from './pages/Consulta';
import ControleLeiturista from './pages/ControleLeiturista';
import ControleEvidencias from './pages/ControleEvidencias';
import NosbImpedimento from './pages/NosbImpedimento';
import NosbSimulacao from './pages/NosbSimulacao';
import ControleHorario from './pages/ControleHorario';
import SequenciaLeitura from './pages/SequenciaLeitura';
import ControleApresentacao from './pages/ControleApresentacao';
import PlaceholderPage from './pages/Placeholder';

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/consulta" element={<Consulta />} />
          <Route path="/leiturista" element={<ControleLeiturista />} />
          <Route path="/evidencias" element={<ControleEvidencias />} />
          <Route path="/nosb" element={<NosbImpedimento />} />
          <Route path="/nosb-simulacao" element={<NosbSimulacao />} />
          <Route path="/horario" element={<ControleHorario />} />
          <Route path="/sequencia" element={<SequenciaLeitura />} />
          <Route path="/apresentacao" element={<ControleApresentacao />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}
