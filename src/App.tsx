import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';
import { 
  Search, 
  Users, 
  Camera, 
  Printer, 
  Clock, 
  ListOrdered,
  Loader2
} from 'lucide-react';

import Layout from './components/Layout';
import Auth from './components/Auth';
import Dashboard from './pages/Dashboard';
import PlaceholderPage from './pages/Placeholder';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route 
            path="/consulta" 
            element={
              <PlaceholderPage 
                title="Consulta de Leituras" 
                icon={Search} 
                description="Módulo de pesquisa avançada por medidor, data ou leiturista. Em breve você poderá filtrar e visualizar detalhes de cada medição."
              />
            } 
          />
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
