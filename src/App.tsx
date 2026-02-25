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
import PlaceholderPage from './pages/Placeholder';

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/consulta" element={<Consulta />} />
          <Route 
            path="/leituristas" 
            element={
              <PlaceholderPage 
                title="Controle de Leituristas" 
                icon={Users} 
                description="Gerencie o cadastro de profissionais, atribuição de setores e acompanhamento de status em tempo real."
              />
            } 
          />
          <Route 
            path="/evidencias" 
            element={
              <PlaceholderPage 
                title="Controle de Evidências" 
                icon={Camera} 
                description="Visualização e validação de fotos e comentários enviados pelos leituristas durante as visitas técnicas."
              />
            } 
          />
          <Route 
            path="/impressao" 
            element={
              <PlaceholderPage 
                title="Controle de Impressão" 
                icon={Printer} 
                description="Geração e impressão de relatórios de produtividade, faturas e ordens de serviço."
              />
            } 
          />
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
