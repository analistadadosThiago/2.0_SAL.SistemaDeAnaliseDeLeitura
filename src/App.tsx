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
          <Route 
            path="/horario" 
            element={
              <PlaceholderPage 
                title="Controle de Horários" 
                icon={Clock} 
                description="Registro de ponto eletrônico, horas trabalhadas e controle de jornada da equipe de campo."
              />
            } 
          />
          <Route 
            path="/sequencia" 
            element={
              <PlaceholderPage 
                title="Sequência de Leitura" 
                icon={ListOrdered} 
                description="Definição da ordem lógica das rotas para otimização do deslocamento e aumento da eficiência operacional."
              />
            } 
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}
